from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest
from anno_lab.cli import main
from click.testing import CliRunner
from django.test import Client, override_settings

from core.models import (
    Annotation,
    Asset,
    EventLog,
    FrontendPlugin,
    Project,
    Task,
    TaskDefinition,
    TaskType,
)

BOOT_PATTERN = re.compile(
    r"window\.__ANNO_LAB_BOOT__ = (?P<boot>\{.*?\});",
    re.DOTALL,
)
REPO_ROOT = Path(__file__).resolve().parents[3]
FRONTENDS_ROOT = REPO_ROOT / "frontends"
runner = CliRunner()


@dataclass(frozen=True)
class PluginFamilySpec:
    frontend_dir: str
    task_type_slug: str
    task_definition: dict[str, Any]
    result: dict[str, Any]
    raw_payload: dict[str, Any]


@dataclass(frozen=True)
class PluginFamilyContext:
    spec: PluginFamilySpec
    manifest: dict[str, Any]
    task: Task

    @property
    def actor(self) -> str:
        return f"{self.spec.task_type_slug}-annotator"

    @property
    def submission_id(self) -> str:
        return f"{self.spec.task_type_slug}-submission-1"

    @property
    def tool_version(self) -> str:
        return f"{self.spec.frontend_dir}@{self.manifest['version']}"


PLUGIN_FAMILY = (
    PluginFamilySpec(
        frontend_dir="salient-poly",
        task_type_slug="salient_poly",
        task_definition={
            "instructions": "Trace each salient object with its own polygon.",
            "min_points": 3,
        },
        result={
            "objects": [
                {
                    "id": "salient-object-1",
                    "type": "polygon",
                    "label": "salient_object",
                    "points": [[32.0, 48.0], [256.0, 52.0], [180.0, 240.0]],
                }
            ]
        },
        raw_payload={
            "source": "salient-poly",
            "ui": {
                "object_count": 1,
                "draft_vertex_count": 0,
                "selected_polygon_id": "salient-object-1",
            },
        },
    ),
    PluginFamilySpec(
        frontend_dir="instance-bbox",
        task_type_slug="instance_bbox",
        task_definition={
            "instructions": "Draw tight boxes around each visible object instance.",
            "object_classes": ["person", "vehicle", "animal"],
            "min_box_size": 12,
        },
        result={
            "objects": [
                {
                    "id": "instance-bbox-box-1",
                    "label": "person",
                    "bbox": {"x": 64.0, "y": 80.0, "width": 220.0, "height": 320.0},
                }
            ]
        },
        raw_payload={
            "source": "instance-bbox",
            "ui": {
                "mode": "select",
                "object_count": 1,
                "selected_box_id": "instance-bbox-box-1",
            },
        },
    ),
    PluginFamilySpec(
        frontend_dir="salient-tbi",
        task_type_slug="salient_tbi",
        task_definition={
            "instruction_text": "Mark the one thing that draws your attention first.",
            "allow_manual_fallback": False,
        },
        result={
            "mode": "signal",
            "target": {
                "kind": "polygon",
                "label": "primary_region",
                "points": [[100.0, 140.0], [300.0, 150.0], [260.0, 360.0]],
            },
            "scene_report": {
                "overwhelm_rating": 4,
                "search_difficulty": "hard",
            },
        },
        raw_payload={
            "source": "salient-tbi",
            "ui": {
                "step": "report",
                "proposal_state": "accepted",
                "prompt_count": 0,
                "target_kind": "polygon",
            },
            "interaction": {
                "first_interaction_kind": "accept_proposal",
                "initial_positive_point": None,
                "refinement_prompts": [],
                "revision_count": 0,
            },
            "timing": {
                "time_to_first_interaction_ms": 1180,
                "time_to_submit_ms": 8420,
            },
            "model": {
                "provider": "pre_annotations",
                "proposal_available": True,
                "proposal_used": True,
                "accepted_without_edit": True,
                "proposal_id": "seed-1",
                "proposal_score": 0.91,
            },
        },
    ),
    PluginFamilySpec(
        frontend_dir="pose-keypoints",
        task_type_slug="pose_keypoints",
        task_definition={
            "instructions": "Annotate one primary person with the ordered keypoint list.",
            "subject_label": "Primary person",
            "landmarks": [
                {"id": "nose", "label": "Nose", "color": "#f28f16"},
                {"id": "left_shoulder", "label": "Left shoulder", "color": "#116466"},
                {"id": "right_shoulder", "label": "Right shoulder", "color": "#3a7d44"},
                {"id": "pelvis", "label": "Pelvis", "color": "#6d597a"},
            ],
            "skeleton": [
                ["nose", "left_shoulder"],
                ["nose", "right_shoulder"],
                ["left_shoulder", "pelvis"],
                ["right_shoulder", "pelvis"],
            ],
        },
        result={
            "subject": {
                "type": "pose_keypoints",
                "label": "Primary person",
                "keypoints": [
                    {
                        "id": "nose",
                        "label": "Nose",
                        "state": "visible",
                        "point": {"x": 144.0, "y": 90.0},
                    },
                    {
                        "id": "left_shoulder",
                        "label": "Left shoulder",
                        "state": "occluded",
                        "point": {"x": 120.0, "y": 168.0},
                    },
                    {
                        "id": "right_shoulder",
                        "label": "Right shoulder",
                        "state": "visible",
                        "point": {"x": 188.0, "y": 170.0},
                    },
                    {
                        "id": "pelvis",
                        "label": "Pelvis",
                        "state": "not_in_frame",
                        "point": None,
                    },
                ],
            }
        },
        raw_payload={
            "source": "pose-keypoints",
            "ui": {
                "mode": "select",
                "resolved_count": 4,
                "selected_landmark_id": "pelvis",
            },
            "skeleton_edge_count": 4,
        },
    ),
)


def _extract_boot_payload(html: str) -> dict[str, Any]:
    match = BOOT_PATTERN.search(html)
    assert match is not None
    return json.loads(match.group("boot"))


def _load_manifest(frontend_dir: str) -> dict[str, Any]:
    manifest_path = FRONTENDS_ROOT / frontend_dir / "manifest.json"
    return json.loads(manifest_path.read_text(encoding="utf-8"))


def _register_plugin(task_type_slug: str, frontend_dir: str) -> FrontendPlugin:
    result = runner.invoke(
        main,
        [
            "register-plugin",
            str((FRONTENDS_ROOT / frontend_dir).resolve()),
            "--task-type",
            task_type_slug,
        ],
    )
    assert result.exit_code == 0, result.output
    return FrontendPlugin.objects.get(task_type__slug=task_type_slug)


def _setup_plugin_family() -> list[PluginFamilyContext]:
    project = Project.objects.create(
        slug="plugin-family-acceptance",
        name="Plugin Family Acceptance",
    )
    contexts: list[PluginFamilyContext] = []

    for index, spec in enumerate(PLUGIN_FAMILY, start=1):
        manifest = _load_manifest(spec.frontend_dir)
        task_type = TaskType.objects.create(
            slug=spec.task_type_slug,
            name=manifest["name"],
        )
        task_definition = TaskDefinition.objects.create(
            task_type=task_type,
            version="1.0.0",
            definition=spec.task_definition,
        )
        asset = Asset.objects.create(
            project=project,
            media_type="image",
            s3_key=f"acceptance/{spec.task_type_slug}-{index}.jpg",
            width=1600,
            height=1200,
            metadata={"plugin": spec.frontend_dir, "suite": "plugin-family-acceptance"},
        )
        task = Task.objects.create(
            project=project,
            asset=asset,
            task_definition=task_definition,
        )

        plugin = _register_plugin(spec.task_type_slug, spec.frontend_dir)
        assert plugin.is_active is True
        assert plugin.name == manifest["name"]
        assert plugin.version == manifest["version"]
        assert plugin.manifest == manifest

        contexts.append(
            PluginFamilyContext(
                spec=spec,
                manifest=manifest,
                task=task,
            )
        )

    return contexts


def _iter_manifest_assets(manifest: dict[str, Any]) -> list[str]:
    return [*manifest.get("css", []), *manifest.get("js", [])]


@pytest.mark.django_db
@override_settings(MTURK_SANDBOX=True, WRITE_TOKEN="family-secret")
def test_plugin_family_registration_bundle_shell_and_assets() -> None:
    client = Client()
    contexts = _setup_plugin_family()

    assert FrontendPlugin.objects.count() == len(PLUGIN_FAMILY)
    assert set(FrontendPlugin.objects.values_list("task_type__slug", flat=True)) == {
        spec.task_type_slug for spec in PLUGIN_FAMILY
    }

    for context in contexts:
        bundle_response = client.get(f"/api/tasks/{context.task.id}/bundle/")
        assert bundle_response.status_code == 200
        bundle = bundle_response.json()
        assert bundle["task"]["id"] == context.task.id
        assert bundle["task_type"]["slug"] == context.spec.task_type_slug
        assert bundle["task_definition"]["version"] == "1.0.0"
        assert bundle["task_definition"]["definition"] == context.spec.task_definition
        assert bundle["asset"]["metadata"]["plugin"] == context.spec.frontend_dir
        assert bundle["plugin"] == context.manifest
        assert bundle["asset_url"] is None

        shell_response = client.get(f"/api/tasks/{context.task.id}/annotate/")
        assert shell_response.status_code == 200
        shell_html = shell_response.content.decode()
        shell_boot = _extract_boot_payload(shell_html)
        assert shell_boot == {"taskId": context.task.id, "apiBase": "/api"}
        assert "writeToken" not in shell_boot

        for asset_path in _iter_manifest_assets(context.manifest):
            asset_route = f"/api/tasks/{context.task.id}/annotate/plugin/{asset_path}"
            assert asset_route in shell_html
            asset_response = client.get(asset_route)
            assert asset_response.status_code == 200
            assert asset_response.content

        mturk_response = client.get(
            (
                f"/api/tasks/{context.task.id}/annotate/mturk/"
                f"?assignmentId={context.spec.task_type_slug}-A1"
                f"&hitId={context.spec.task_type_slug}-H1"
                f"&workerId={context.spec.task_type_slug}-W1"
                # Simulate a production-intent request; settings must still force sandbox.
                "&sandbox=0"
            )
        )
        assert mturk_response.status_code == 200
        mturk_html = mturk_response.content.decode()
        mturk_boot = _extract_boot_payload(mturk_html)
        assert mturk_boot["taskId"] == context.task.id
        assert mturk_boot["apiBase"] == "/api"
        assert "writeToken" not in mturk_boot
        assert mturk_boot["mturk"] == {
            "assignmentId": f"{context.spec.task_type_slug}-A1",
            "hitId": f"{context.spec.task_type_slug}-H1",
            "workerId": f"{context.spec.task_type_slug}-W1",
            "sandbox": True,
            "submitUrl": "https://workersandbox.mturk.com/mturk/externalSubmit",
        }
        assert "https://workersandbox.mturk.com/mturk/externalSubmit" in mturk_html
        assert "https://www.mturk.com/mturk/externalSubmit" not in mturk_html


@pytest.mark.django_db
@override_settings(WRITE_TOKEN="family-secret")
def test_plugin_family_submission_idempotency_and_provenance() -> None:
    client = Client()
    contexts = _setup_plugin_family()
    headers = {"HTTP_X_ANNO_LAB_WRITE_TOKEN": "family-secret"}
    annotations_by_submission_id: dict[str, Annotation] = {}

    for context in contexts:
        payload = {
            "task": context.task.id,
            "result": context.spec.result,
            "schema_version": context.manifest["result_schema_version"],
            "tool_version": context.tool_version,
            "actor": context.actor,
            "submission_id": context.submission_id,
            "raw_payload": context.spec.raw_payload,
        }

        first_response = client.post(
            "/api/annotations/",
            data=payload,
            content_type="application/json",
            **headers,
        )
        duplicate_response = client.post(
            "/api/annotations/",
            data=payload,
            content_type="application/json",
            **headers,
        )

        assert first_response.status_code == 201
        assert duplicate_response.status_code == 200
        assert duplicate_response.json()["id"] == first_response.json()["id"]

        annotation = Annotation.objects.get(id=first_response.json()["id"])
        annotations_by_submission_id[context.submission_id] = annotation
        assert annotation.task_id == context.task.id
        assert annotation.result == context.spec.result
        assert annotation.schema_version == context.manifest["result_schema_version"]
        assert annotation.tool_version == context.tool_version
        assert annotation.actor == context.actor
        assert annotation.submission_id == context.submission_id
        assert annotation.assignment_id is None
        assert annotation.raw_payload == context.spec.raw_payload

    assert Annotation.objects.count() == len(PLUGIN_FAMILY)
    assert EventLog.objects.filter(event_type="ANNOTATION_CREATED").count() == len(
        PLUGIN_FAMILY
    )

    event_logs = list(EventLog.objects.filter(event_type="ANNOTATION_CREATED"))
    for context in contexts:
        annotation = annotations_by_submission_id[context.submission_id]
        matching_log = next(
            log
            for log in event_logs
            if log.payload.get("submission_id") == context.submission_id
        )
        assert matching_log.actor == context.actor
        assert matching_log.payload == {
            "task_id": context.task.id,
            "annotation_id": annotation.id,
            "submission_id": context.submission_id,
            "assignment_id": None,
        }
