from __future__ import annotations

import json
from pathlib import Path
from unittest import mock

import pytest
from anno_lab.cli import main
from click.testing import CliRunner

import core.plugin_validation as plugin_validation
from core.models import (
    Annotation,
    Asset,
    Assignment,
    FrontendPlugin,
    Project,
    Task,
    TaskDefinition,
    TaskType,
)

runner = CliRunner()


def _write_plugin_fixture(frontends_root: Path, manifest: dict) -> Path:
    plugin_dir = frontends_root / manifest["root"]
    plugin_dir.mkdir(parents=True, exist_ok=True)

    for asset_path in manifest.get("js", []) + manifest.get("css", []):
        file_path = plugin_dir / asset_path
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text("fixture", encoding="utf-8")

    (plugin_dir / "manifest.json").write_text(
        json.dumps(manifest),
        encoding="utf-8",
    )
    return plugin_dir


@pytest.mark.django_db
def test_register_plugin_cli_saves_validated_manifest(tmp_path: Path) -> None:
    frontends_root = tmp_path / "frontends"
    frontends_root.mkdir()
    manifest = {
        "name": " Test Plugin ",
        "task_type": "instance_bbox",
        "version": " 1.2.3 ",
        "root": "test-plugin",
        "js": ["assets/index.js"],
        "css": ["assets/index.css"],
        "result_schema_version": "1.0.0",
    }
    plugin_dir = _write_plugin_fixture(frontends_root, manifest)
    task_type = TaskType.objects.create(slug="instance_bbox", name="Instance Bounding Box")

    with mock.patch.object(plugin_validation, "FRONTENDS_ROOT", frontends_root.resolve()):
        result = runner.invoke(
            main,
            ["register-plugin", str(plugin_dir), "--task-type", task_type.slug],
        )

    assert result.exit_code == 0
    plugin = FrontendPlugin.objects.get(task_type=task_type)
    assert plugin.name == "Test Plugin"
    assert plugin.version == "1.2.3"
    assert plugin.manifest["name"] == "Test Plugin"
    assert plugin.manifest["version"] == "1.2.3"


@pytest.mark.django_db
def test_register_plugin_cli_rejects_manifest_task_type_mismatch(
    tmp_path: Path,
) -> None:
    frontends_root = tmp_path / "frontends"
    frontends_root.mkdir()
    manifest = {
        "name": "Test Plugin",
        "task_type": "segmentation",
        "version": "1.2.3",
        "root": "test-plugin",
        "js": ["assets/index.js"],
        "css": [],
        "result_schema_version": "1.0.0",
    }
    plugin_dir = _write_plugin_fixture(frontends_root, manifest)
    TaskType.objects.create(slug="instance_bbox", name="Instance Bounding Box")

    with mock.patch.object(plugin_validation, "FRONTENDS_ROOT", frontends_root.resolve()):
        result = runner.invoke(
            main,
            ["register-plugin", str(plugin_dir), "--task-type", "instance_bbox"],
        )

    assert result.exit_code == 1
    assert "does not match plugin task_type" in result.output
    assert FrontendPlugin.objects.count() == 0


@pytest.mark.django_db
def test_register_plugin_cli_rejects_manifest_root_outside_frontends(
    tmp_path: Path,
) -> None:
    plugin_dir = tmp_path / "plugin"
    plugin_dir.mkdir()
    manifest = {
        "name": "Test Plugin",
        "task_type": "instance_bbox",
        "version": "1.2.3",
        "root": "../escape",
        "js": ["assets/index.js"],
        "css": [],
        "result_schema_version": "1.0.0",
    }
    (plugin_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    TaskType.objects.create(slug="instance_bbox", name="Instance Bounding Box")

    result = runner.invoke(
        main,
        ["register-plugin", str(plugin_dir), "--task-type", "instance_bbox"],
    )

    assert result.exit_code == 1
    assert "must be a relative path within /frontends" in result.output
    assert FrontendPlugin.objects.count() == 0


@pytest.mark.django_db
def test_export_project_data_cli_emits_raw_collection_bundle() -> None:
    project = Project.objects.create(slug="cli-export", name="CLI Export")
    task_type = TaskType.objects.create(slug="instance_bbox", name="Instance Bounding Box")
    task_definition = TaskDefinition.objects.create(
        task_type=task_type,
        version="1.0.0",
        definition={"object_classes": ["person"]},
    )
    asset = Asset.objects.create(
        project=project,
        media_type="image",
        s3_key="cli/asset-001.jpg",
        width=1024,
        height=768,
        metadata={"split": "validation"},
    )
    task = Task.objects.create(
        project=project,
        asset=asset,
        task_definition=task_definition,
        payload={"wave": "pilot"},
    )
    assignment = Assignment.objects.create(
        task=task,
        backend="mturk",
        hit_id="HIT-CLI-001",
        assignment_id="ASSIGNMENT-CLI-001",
        worker_id="WORKER-CLI-001",
        status="submitted",
        payload={
            "mturk_record": {
                "AssignmentId": "ASSIGNMENT-CLI-001",
                "WorkerId": "WORKER-CLI-001",
                "HITId": "HIT-CLI-001",
            },
            "answers": {"annotation": '{"result":{"label":"person"}}'},
        },
    )
    annotation = Annotation.objects.create(
        task=task,
        assignment=assignment,
        result={
            "objects": [{"id": "box-1", "label": "person"}]
        },
        schema_version="1.0.0",
        tool_version="instance-bbox@0.1.5",
        actor="cli-worker",
        submission_id="cli-submission",
        raw_payload={"ingested_via": "mturk"},
    )

    raw_result = runner.invoke(main, ["export-project-data", project.slug])

    assert raw_result.exit_code == 0
    raw_payload = json.loads(raw_result.output)
    assert raw_payload["export_contract"] == "anno_lab_raw_collection_export"
    assert raw_payload["summary"] == {
        "asset_count": 1,
        "task_count": 1,
        "assignment_count": 1,
        "annotation_count": 1,
    }
    assert raw_payload["project"]["slug"] == "cli-export"
    assert raw_payload["assets"] == [
        {
            "id": asset.id,
            "project_id": project.id,
            "media_type": "image",
            "s3_key": "cli/asset-001.jpg",
            "sha256": "",
            "width": 1024,
            "height": 768,
            "metadata": {"split": "validation"},
            "created_at": asset.created_at.isoformat(),
        }
    ]
    assert raw_payload["assignments"][0]["payload"]["mturk_record"]["AssignmentId"] == (
        "ASSIGNMENT-CLI-001"
    )
    assert raw_payload["annotations"] == [
        {
            "id": annotation.id,
            "task_id": task.id,
            "assignment_id": assignment.id,
            "result": {"objects": [{"id": "box-1", "label": "person"}]},
            "schema_version": "1.0.0",
            "tool_version": "instance-bbox@0.1.5",
            "actor": "cli-worker",
            "submission_id": "cli-submission",
            "raw_payload": {"ingested_via": "mturk"},
            "created_at": annotation.created_at.isoformat(),
        }
    ]



def test_sync_mturk_cli_reports_hit_and_ingest_counts() -> None:
    with mock.patch("anno_lab.cli.setup_django"), mock.patch(
        "core.mturk.sync_open_hits",
        return_value={"hits": 3, "assignments_seen": 7, "assignments_updated": 5},
    ), mock.patch(
        "core.mturk.ingest_submitted_assignments",
        return_value={"ingested": 2, "skipped": 1},
    ):
        result = runner.invoke(main, ["sync-mturk", "--limit", "3"])

    assert result.exit_code == 0
    assert "Synced 3 HITs" in result.output
    assert "Ingested 2 assignments" in result.output


def test_import_salient_tbi_seeds_cli_delegates_to_management_command(tmp_path: Path) -> None:
    artifact_path = tmp_path / "seed-batch.json"
    artifact_path.write_text("{}", encoding="utf-8")

    with mock.patch("anno_lab.cli.setup_django"), mock.patch(
        "django.core.management.call_command"
    ) as call_command:
        result = runner.invoke(
            main,
            [
                "import-salient-tbi-seeds",
                str(artifact_path),
                "--dry-run",
                "--overwrite-stale",
            ],
        )

    assert result.exit_code == 0
    call_command.assert_called_once_with(
        "import_salient_tbi_seeds",
        str(artifact_path),
        "--dry-run",
        "--overwrite-stale",
    )
