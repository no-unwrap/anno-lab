import json
import re
from unittest import mock

import pytest
from django.test import Client, override_settings

from core.models import Asset, FrontendPlugin, Project, Task, TaskDefinition, TaskType

BOOT_PATTERN = re.compile(
    r"window\.__ANNO_LAB_BOOT__ = (?P<boot>\{.*?\});",
    re.DOTALL,
)


def _extract_boot_payload(html: str) -> dict:
    match = BOOT_PATTERN.search(html)
    assert match is not None
    return json.loads(match.group("boot"))


@pytest.mark.django_db
class TestUiSurface:
    def setup_method(self):
        self.client = Client()
        self.project = Project.objects.create(slug="test", name="Test Project")
        self.asset = Asset.objects.create(
            project=self.project,
            media_type="image",
            s3_key="test.jpg",
        )
        self.task_type = TaskType.objects.create(
            slug="salient_poly",
            name="Salient Poly",
        )
        self.task_definition = TaskDefinition.objects.create(
            task_type=self.task_type,
            version="1.0.0",
            definition={},
        )
        self.task = Task.objects.create(
            project=self.project,
            asset=self.asset,
            task_definition=self.task_definition,
        )
        FrontendPlugin.objects.create(
            task_type=self.task_type,
            name="Salient Poly",
            version="0.1.0",
            manifest={
                "name": "Salient Poly",
                "task_type": "salient_poly",
                "version": "0.1.0",
                "root": "salient-poly/dist",
                "js": ["assets/index.js"],
                "css": ["assets/index.css"],
                "result_schema_version": "1.0.0",
            },
            is_active=True,
        )

    def test_annotate_shell_uses_plugin_asset_route(self):
        response = self.client.get(f"/api/tasks/{self.task.id}/annotate/")

        assert response.status_code == 200
        html = response.content.decode()
        assert "window.__ANNO_LAB_BOOT__" in html
        boot = _extract_boot_payload(html)
        assert (
            f'href="/api/tasks/{self.task.id}/annotate/plugin/assets/index.css"'
            in html
        )
        assert (
            f'src="/api/tasks/{self.task.id}/annotate/plugin/assets/index.js"'
            in html
        )
        assert boot == {
            "taskId": self.task.id,
            "apiBase": "/api",
        }

    @override_settings(WRITE_TOKEN="secret-token")
    def test_annotate_shell_does_not_expose_write_token_when_enabled(self):
        response = self.client.get(f"/api/tasks/{self.task.id}/annotate/")

        assert response.status_code == 200
        boot = _extract_boot_payload(response.content.decode())
        assert "writeToken" not in boot

    @override_settings(MTURK_SANDBOX=True)
    def test_mturk_shell_uses_settings_owned_sandbox_and_plugin_assets(self):
        response = self.client.get(
            f"/api/tasks/{self.task.id}/annotate/mturk/"
            "?assignmentId=A1&hitId=H1&workerId=W1&sandbox=0"
        )

        assert response.status_code == 200
        html = response.content.decode()
        assert "window.__ANNO_LAB_BOOT__" in html
        boot = _extract_boot_payload(html)
        assert (
            f'href="/api/tasks/{self.task.id}/annotate/plugin/assets/index.css"'
            in html
        )
        assert (
            f'src="/api/tasks/{self.task.id}/annotate/plugin/assets/index.js"'
            in html
        )
        assert "workersandbox.mturk.com/mturk/externalSubmit" in html
        assert '"sandbox": true' in html
        assert "https://www.mturk.com/mturk/externalSubmit" not in html
        assert boot["taskId"] == self.task.id
        assert boot["apiBase"] == "/api"
        assert boot["mturk"] == {
            "assignmentId": "A1",
            "hitId": "H1",
            "workerId": "W1",
            "sandbox": True,
            "submitUrl": "https://workersandbox.mturk.com/mturk/externalSubmit",
        }

    @override_settings(MTURK_SANDBOX=True)
    def test_mturk_shell_escapes_boot_payload_for_inline_script_safety(self):
        assignment_id = "</script><script>alert(1)</script>"
        response = self.client.get(
            f"/api/tasks/{self.task.id}/annotate/mturk/",
            {
                "assignmentId": assignment_id,
                "hitId": "H1",
                "workerId": "W1",
            },
        )

        assert response.status_code == 200
        html = response.content.decode()
        boot = _extract_boot_payload(html)
        assert assignment_id not in html
        assert "\\u003C/script\\u003E\\u003Cscript\\u003Ealert(1)\\u003C/script\\u003E" in html
        assert boot["mturk"]["assignmentId"] == assignment_id

    @override_settings(MTURK_SANDBOX=True, WRITE_TOKEN="secret-token")
    def test_mturk_shell_does_not_expose_write_token_when_enabled(self):
        response = self.client.get(
            f"/api/tasks/{self.task.id}/annotate/mturk/"
            "?assignmentId=A1&hitId=H1&workerId=W1"
        )

        assert response.status_code == 200
        boot = _extract_boot_payload(response.content.decode())
        assert "writeToken" not in boot

    @override_settings(S3_BUCKET="asset-bucket")
    def test_task_bundle_includes_backend_asset_url(self):
        with mock.patch.object(
            Asset,
            "presigned_url",
            return_value="https://signed.example.com/task.jpg",
        ) as presigned_url:
            response = self.client.get(f"/api/tasks/{self.task.id}/bundle/")

        assert response.status_code == 200
        assert response.json()["asset_url"] == "https://signed.example.com/task.jpg"
        presigned_url.assert_called_once_with()

    @override_settings(S3_BUCKET="")
    def test_task_bundle_returns_null_asset_url_without_delivery_config(self):
        response = self.client.get(f"/api/tasks/{self.task.id}/bundle/")

        assert response.status_code == 200
        assert response.json()["asset_url"] is None
