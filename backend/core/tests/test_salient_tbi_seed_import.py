from __future__ import annotations

import json
from io import StringIO
from pathlib import Path

import pytest
from django.core.management import call_command

from core.models import Asset, EventLog, Project, Task, TaskDefinition, TaskType
from core.salient_tbi_seed_import import (
    SALIENT_TBI_CHECKPOINT,
    SALIENT_TBI_PROVIDER,
    SALIENT_TBI_TASK_TYPE_SLUG,
    SeedImportError,
    SeedPoint,
    import_salient_tbi_seed_batch,
    load_salient_tbi_seed_batch,
    normalize_seed_polygon,
)


def _build_seed_artifact(task_ids: list[int], *, checkpoint: str = SALIENT_TBI_CHECKPOINT, run_id: str = "pilot-run-001") -> dict:
    return {
        "schema_version": "1.0.0",
        "task_type": SALIENT_TBI_TASK_TYPE_SLUG,
        "provider": SALIENT_TBI_PROVIDER,
        "checkpoint": checkpoint,
        "run_id": run_id,
        "proposals": [
            {
                "task_id": task_id,
                "proposal_id": f"proposal-{task_id}",
                "score": 0.91,
                "polygon": [
                    {"x": -10.0, "y": 20.0},
                    {"x": 240.0, "y": 40.0},
                    {"x": 260.0, "y": 320.0},
                    {"x": 40.0, "y": 360.0},
                    {"x": -10.0, "y": 20.0},
                ],
            }
            for task_id in task_ids
        ],
    }


@pytest.mark.django_db
def test_load_seed_batch_rejects_duplicate_task_ids(tmp_path: Path) -> None:
    artifact = _build_seed_artifact([11, 11])
    artifact_path = tmp_path / "batch.json"
    artifact_path.write_text(json.dumps(artifact), encoding="utf-8")

    with pytest.raises(SeedImportError, match="Duplicate proposal"):
        load_salient_tbi_seed_batch(artifact_path)


@pytest.mark.django_db
def test_normalize_seed_polygon_clamps_and_removes_duplicate_closure() -> None:
    normalized = normalize_seed_polygon(
        (
            SeedPoint(x=-2.0, y=0.0),
            SeedPoint(x=10.0, y=0.0),
            SeedPoint(x=10.0, y=12.0),
            SeedPoint(x=-2.0, y=12.0),
            SeedPoint(x=-2.0, y=0.0),
        ),
        width=8,
        height=10,
    )

    assert normalized == [
        {"x": 0.0, "y": 0.0},
        {"x": 8.0, "y": 0.0},
        {"x": 8.0, "y": 10.0},
        {"x": 0.0, "y": 10.0},
    ]


@pytest.mark.django_db
def test_import_seed_batch_writes_pre_annotations_and_preserves_other_payload_keys(tmp_path: Path) -> None:
    project = Project.objects.create(slug="seed-import", name="Seed Import")
    task_type = TaskType.objects.create(slug=SALIENT_TBI_TASK_TYPE_SLUG, name="Salient TBI")
    task_definition = TaskDefinition.objects.create(
        task_type=task_type,
        version="1.0.0",
        definition={"instruction_text": "Mark the signal."},
    )
    asset = Asset.objects.create(
        project=project,
        media_type="image",
        s3_key="seed-import/example.jpg",
        width=320,
        height=240,
    )
    task = Task.objects.create(
        project=project,
        asset=asset,
        task_definition=task_definition,
        payload={"wave": "pilot-1"},
    )

    artifact = _build_seed_artifact([task.id])
    artifact_path = tmp_path / "batch.json"
    artifact_path.write_text(json.dumps(artifact), encoding="utf-8")

    batch = load_salient_tbi_seed_batch(artifact_path)
    summary = import_salient_tbi_seed_batch(batch)

    task.refresh_from_db()
    assert summary.created == 1
    assert task.payload["wave"] == "pilot-1"
    assert task.payload["pre_annotations"]["metadata"] == {
        "provider": SALIENT_TBI_PROVIDER,
        "checkpoint": SALIENT_TBI_CHECKPOINT,
        "run_id": "pilot-run-001",
    }
    prediction = task.payload["pre_annotations"]["predictions"][0]
    assert prediction["id"] == f"proposal-{task.id}"
    assert prediction["kind"] == "polygon"
    assert prediction["label"] == "primary_region"
    assert prediction["score"] == 0.91
    assert prediction["points"][0] == {"x": 0.0, "y": 20.0}

    event = EventLog.objects.get(event_type="SALIENT_TBI_SEED_IMPORT")
    assert event.payload["created"] == 1
    assert event.payload["run_id"] == "pilot-run-001"

    repeated_summary = import_salient_tbi_seed_batch(batch)
    assert repeated_summary.created == 0
    assert repeated_summary.updated == 0
    assert repeated_summary.skipped_existing == 1


@pytest.mark.django_db
def test_import_seed_batch_skips_existing_by_default_and_overwrites_stale_when_requested(tmp_path: Path) -> None:
    project = Project.objects.create(slug="seed-overwrite", name="Seed Overwrite")
    task_type = TaskType.objects.create(slug=SALIENT_TBI_TASK_TYPE_SLUG, name="Salient TBI")
    task_definition = TaskDefinition.objects.create(
        task_type=task_type,
        version="1.0.0",
        definition={},
    )
    asset = Asset.objects.create(
        project=project,
        media_type="image",
        s3_key="seed-overwrite/example.jpg",
        width=400,
        height=300,
    )
    task = Task.objects.create(
        project=project,
        asset=asset,
        task_definition=task_definition,
        payload={
            "pre_annotations": {
                "schema_version": "1.0.0",
                "metadata": {
                    "provider": "sam2.0",
                    "checkpoint": "sam2.0-hiera-tiny",
                    "run_id": "old-run",
                },
                "predictions": [
                    {
                        "id": "old-proposal",
                        "kind": "polygon",
                        "label": "primary_region",
                        "score": 0.33,
                        "points": [
                            {"x": 5.0, "y": 5.0},
                            {"x": 15.0, "y": 5.0},
                            {"x": 10.0, "y": 20.0},
                        ],
                    }
                ],
            }
        },
    )

    artifact = _build_seed_artifact([task.id])
    artifact_path = tmp_path / "batch.json"
    artifact_path.write_text(json.dumps(artifact), encoding="utf-8")
    batch = load_salient_tbi_seed_batch(artifact_path)

    skipped_summary = import_salient_tbi_seed_batch(batch)
    task.refresh_from_db()
    assert skipped_summary.skipped_stale == 1
    assert task.payload["pre_annotations"]["metadata"]["provider"] == "sam2.0"

    updated_summary = import_salient_tbi_seed_batch(batch, overwrite_stale=True)
    task.refresh_from_db()
    assert updated_summary.updated == 1
    assert task.payload["pre_annotations"]["metadata"]["provider"] == SALIENT_TBI_PROVIDER
    assert task.payload["pre_annotations"]["metadata"]["checkpoint"] == SALIENT_TBI_CHECKPOINT


@pytest.mark.django_db
def test_management_command_supports_dry_run_without_writing_payloads(tmp_path: Path) -> None:
    project = Project.objects.create(slug="seed-dry-run", name="Seed Dry Run")
    task_type = TaskType.objects.create(slug=SALIENT_TBI_TASK_TYPE_SLUG, name="Salient TBI")
    task_definition = TaskDefinition.objects.create(
        task_type=task_type,
        version="1.0.0",
        definition={},
    )
    asset = Asset.objects.create(
        project=project,
        media_type="image",
        s3_key="seed-dry-run/example.jpg",
        width=320,
        height=240,
    )
    task = Task.objects.create(
        project=project,
        asset=asset,
        task_definition=task_definition,
    )

    artifact_path = tmp_path / "batch.json"
    artifact_path.write_text(json.dumps(_build_seed_artifact([task.id])), encoding="utf-8")

    stdout = StringIO()
    call_command("import_salient_tbi_seeds", str(artifact_path), dry_run=True, stdout=stdout)

    task.refresh_from_db()
    assert "pre_annotations" not in task.payload
    assert "Dry run only" in stdout.getvalue()
