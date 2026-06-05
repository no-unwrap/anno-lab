from __future__ import annotations

import json
from typing import Any

from django.utils import timezone

from .models import Annotation, Asset, Assignment, Project, Task, TaskDefinition, TaskType

SUPPORTED_EXPORT_FORMATS = ("json",)
RAW_EXPORT_CONTRACT = "anno_lab_raw_collection_export"
RAW_EXPORT_VERSION = "1.0.0"


class ExportError(ValueError):
    """Raised when an export request cannot be satisfied safely."""


def render_project_export(project: Project, format_type: str) -> tuple[str, str, str]:
    if format_type != "json":
        supported = ", ".join(SUPPORTED_EXPORT_FORMATS)
        raise ExportError(f"Invalid format. Supported: {supported}")

    payload = build_project_raw_collection_export(project)
    return (
        json.dumps(payload, indent=2, sort_keys=True),
        "application/json",
        f"{project.slug}_raw_collection_export.json",
    )


def build_project_raw_collection_export(project: Project) -> dict[str, Any]:
    assets = list(Asset.objects.filter(project=project).order_by("id"))
    tasks = list(
        Task.objects.filter(project=project)
        .select_related("asset", "task_definition__task_type")
        .order_by("id")
    )
    assignments = list(
        Assignment.objects.filter(task__project=project)
        .select_related("task")
        .order_by("task_id", "created_at", "id")
    )
    annotations = list(
        Annotation.objects.filter(task__project=project)
        .select_related("task", "assignment")
        .order_by("task_id", "created_at", "id")
    )

    task_definitions_by_id: dict[int, TaskDefinition] = {}
    task_types_by_id: dict[int, TaskType] = {}
    for task in tasks:
        task_definition = task.task_definition
        task_definitions_by_id[task_definition.id] = task_definition
        task_types_by_id[task_definition.task_type_id] = task_definition.task_type

    return {
        "export_contract": RAW_EXPORT_CONTRACT,
        "export_version": RAW_EXPORT_VERSION,
        "exported_at": timezone.now().isoformat(),
        "project": _serialize_project(project),
        "summary": {
            "asset_count": len(assets),
            "task_count": len(tasks),
            "assignment_count": len(assignments),
            "annotation_count": len(annotations),
        },
        "task_types": [
            _serialize_task_type(task_types_by_id[task_type_id])
            for task_type_id in sorted(task_types_by_id)
        ],
        "task_definitions": [
            _serialize_task_definition(task_definitions_by_id[task_definition_id])
            for task_definition_id in sorted(task_definitions_by_id)
        ],
        "assets": [_serialize_asset(asset) for asset in assets],
        "tasks": [_serialize_task(task) for task in tasks],
        "assignments": [_serialize_assignment(assignment) for assignment in assignments],
        "annotations": [_serialize_annotation(annotation) for annotation in annotations],
    }


def _serialize_project(project: Project) -> dict[str, Any]:
    return {
        "id": project.id,
        "slug": project.slug,
        "name": project.name,
        "description": project.description,
        "created_at": project.created_at.isoformat(),
    }


def _serialize_task_type(task_type: TaskType) -> dict[str, Any]:
    return {
        "id": task_type.id,
        "slug": task_type.slug,
        "name": task_type.name,
        "description": task_type.description,
    }


def _serialize_task_definition(task_definition: TaskDefinition) -> dict[str, Any]:
    return {
        "id": task_definition.id,
        "task_type_id": task_definition.task_type_id,
        "version": task_definition.version,
        "definition": task_definition.definition,
        "created_at": task_definition.created_at.isoformat(),
    }


def _serialize_asset(asset: Asset) -> dict[str, Any]:
    width = asset.width
    height = asset.height
    if asset.media_type == "image":
        width = _require_positive_asset_dimension(asset, "width", width)
        height = _require_positive_asset_dimension(asset, "height", height)
    return {
        "id": asset.id,
        "project_id": asset.project_id,
        "media_type": asset.media_type,
        "s3_key": asset.s3_key,
        "sha256": asset.sha256,
        "width": width,
        "height": height,
        "metadata": asset.metadata,
        "created_at": asset.created_at.isoformat(),
    }


def _serialize_task(task: Task) -> dict[str, Any]:
    return {
        "id": task.id,
        "project_id": task.project_id,
        "asset_id": task.asset_id,
        "task_definition_id": task.task_definition_id,
        "status": task.status,
        "priority": task.priority,
        "assigned_to": task.assigned_to,
        "payload": task.payload,
        "created_at": task.created_at.isoformat(),
    }


def _serialize_assignment(assignment: Assignment) -> dict[str, Any]:
    return {
        "id": assignment.id,
        "task_id": assignment.task_id,
        "backend": assignment.backend,
        "hit_id": assignment.hit_id,
        "assignment_id": assignment.assignment_id,
        "worker_id": assignment.worker_id,
        "status": assignment.status,
        "sandbox": assignment.sandbox,
        "payload": assignment.payload,
        "last_polled_at": _optional_isoformat(assignment.last_polled_at),
        "ingested_at": _optional_isoformat(assignment.ingested_at),
        "created_at": assignment.created_at.isoformat(),
        "updated_at": assignment.updated_at.isoformat(),
    }


def _serialize_annotation(annotation: Annotation) -> dict[str, Any]:
    return {
        "id": annotation.id,
        "task_id": annotation.task_id,
        "assignment_id": annotation.assignment_id,
        "result": annotation.result,
        "schema_version": annotation.schema_version,
        "tool_version": annotation.tool_version,
        "actor": annotation.actor,
        "submission_id": annotation.submission_id,
        "raw_payload": annotation.raw_payload,
        "created_at": annotation.created_at.isoformat(),
    }


def _optional_isoformat(value: Any) -> str | None:
    if value is None:
        return None
    return value.isoformat()


def _require_positive_asset_dimension(asset: Asset, field_name: str, value: Any) -> int:
    if isinstance(value, int) and value > 0:
        return value
    raise ExportError(
        f"Asset {asset.id} must include a positive {field_name} for raw collection export"
    )
