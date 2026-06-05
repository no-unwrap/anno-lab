from __future__ import annotations

import json
from dataclasses import dataclass, replace
from math import isfinite
from pathlib import Path
from typing import Any

from django.db import transaction

from core.models import Task, log_event

PRE_ANNOTATIONS_SCHEMA_VERSION = "1.0.0"
SALIENT_TBI_BATCH_SCHEMA_VERSION = "1.0.0"
SALIENT_TBI_TASK_TYPE_SLUG = "salient_tbi"
SALIENT_TBI_PROVIDER = "sam2.1"
SALIENT_TBI_CHECKPOINT = "sam2.1-hiera-small"
SALIENT_TBI_POLYGON_LABEL = "primary_region"
SALIENT_TBI_SIMPLIFY_TOLERANCE_PX = 2.0
SALIENT_TBI_MAX_POLYGON_VERTICES = 128
MIN_POLYGON_AREA = 1.0


class SeedImportError(ValueError):
    """Raised when a seed proposal artifact is malformed."""


@dataclass(frozen=True)
class SeedPoint:
    x: float
    y: float


@dataclass(frozen=True)
class SalientTbiSeedProposal:
    task_id: int
    proposal_id: str
    score: float
    polygon: tuple[SeedPoint, ...]


@dataclass(frozen=True)
class SalientTbiSeedBatch:
    schema_version: str
    task_type: str
    provider: str
    checkpoint: str
    run_id: str
    proposals: tuple[SalientTbiSeedProposal, ...]


@dataclass(frozen=True)
class SalientTbiSeedImportSummary:
    proposals_seen: int = 0
    created: int = 0
    updated: int = 0
    skipped_existing: int = 0
    skipped_stale: int = 0
    skipped_missing_task: int = 0
    skipped_wrong_task_type: int = 0
    skipped_missing_asset_dimensions: int = 0
    skipped_invalid_polygon: int = 0

    def as_dict(self) -> dict[str, int]:
        return {
            "proposals_seen": self.proposals_seen,
            "created": self.created,
            "updated": self.updated,
            "skipped_existing": self.skipped_existing,
            "skipped_stale": self.skipped_stale,
            "skipped_missing_task": self.skipped_missing_task,
            "skipped_wrong_task_type": self.skipped_wrong_task_type,
            "skipped_missing_asset_dimensions": self.skipped_missing_asset_dimensions,
            "skipped_invalid_polygon": self.skipped_invalid_polygon,
        }


def _as_record(value: Any, *, context: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise SeedImportError(f"{context} must be a JSON object.")
    return value


def _read_non_empty_string(value: Any, *, context: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise SeedImportError(f"{context} must be a non-empty string.")
    return value.strip()


def _read_positive_int(value: Any, *, context: str) -> int:
    if not isinstance(value, int) or value <= 0:
        raise SeedImportError(f"{context} must be a positive integer.")
    return value


def _read_finite_number(value: Any, *, context: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise SeedImportError(f"{context} must be a finite number.")

    number = float(value)
    if not isfinite(number):
        raise SeedImportError(f"{context} must be a finite number.")
    return number


def _bump_summary(
    summary: SalientTbiSeedImportSummary,
    **updates: int,
) -> SalientTbiSeedImportSummary:
    return replace(summary, **updates)


def _read_polygon_points(raw_points: Any, *, context: str) -> tuple[SeedPoint, ...]:
    if not isinstance(raw_points, list):
        raise SeedImportError(f"{context} must be an array of point objects.")

    points: list[SeedPoint] = []
    for index, raw_point in enumerate(raw_points):
        point = _as_record(raw_point, context=f"{context}[{index}]")
        points.append(
            SeedPoint(
                x=_read_finite_number(point.get("x"), context=f"{context}[{index}].x"),
                y=_read_finite_number(point.get("y"), context=f"{context}[{index}].y"),
            )
        )

    if len(points) < 3:
        raise SeedImportError(f"{context} must contain at least 3 points.")

    return tuple(points)


def load_salient_tbi_seed_batch(path: str | Path) -> SalientTbiSeedBatch:
    artifact_path = Path(path)
    raw = json.loads(artifact_path.read_text(encoding="utf-8"))
    document = _as_record(raw, context="seed proposal artifact")

    schema_version = _read_non_empty_string(
        document.get("schema_version"), context="schema_version"
    )
    if schema_version != SALIENT_TBI_BATCH_SCHEMA_VERSION:
        raise SeedImportError(
            f"schema_version must be {SALIENT_TBI_BATCH_SCHEMA_VERSION!r}."
        )

    task_type = _read_non_empty_string(document.get("task_type"), context="task_type")
    if task_type != SALIENT_TBI_TASK_TYPE_SLUG:
        raise SeedImportError(
            f"task_type must be {SALIENT_TBI_TASK_TYPE_SLUG!r} for this importer."
        )

    provider = _read_non_empty_string(document.get("provider"), context="provider")
    checkpoint = _read_non_empty_string(
        document.get("checkpoint"), context="checkpoint"
    )
    run_id = _read_non_empty_string(document.get("run_id"), context="run_id")

    raw_proposals = document.get("proposals")
    if not isinstance(raw_proposals, list) or not raw_proposals:
        raise SeedImportError("proposals must be a non-empty array.")

    proposals: list[SalientTbiSeedProposal] = []
    seen_task_ids: set[int] = set()

    for index, raw_proposal in enumerate(raw_proposals):
        proposal = _as_record(raw_proposal, context=f"proposals[{index}]")
        task_id = _read_positive_int(proposal.get("task_id"), context=f"proposals[{index}].task_id")
        if task_id in seen_task_ids:
            raise SeedImportError(f"Duplicate proposal for task_id={task_id}.")
        seen_task_ids.add(task_id)

        proposals.append(
            SalientTbiSeedProposal(
                task_id=task_id,
                proposal_id=_read_non_empty_string(
                    proposal.get("proposal_id"),
                    context=f"proposals[{index}].proposal_id",
                ),
                score=_read_finite_number(
                    proposal.get("score"),
                    context=f"proposals[{index}].score",
                ),
                polygon=_read_polygon_points(
                    proposal.get("polygon"),
                    context=f"proposals[{index}].polygon",
                ),
            )
        )

    return SalientTbiSeedBatch(
        schema_version=schema_version,
        task_type=task_type,
        provider=provider,
        checkpoint=checkpoint,
        run_id=run_id,
        proposals=tuple(proposals),
    )


def _round_point(point: SeedPoint) -> SeedPoint:
    return SeedPoint(
        x=round(point.x, 2),
        y=round(point.y, 2),
    )


def _points_equal(left: SeedPoint, right: SeedPoint) -> bool:
    return left.x == right.x and left.y == right.y


def _sanitize_points(points: tuple[SeedPoint, ...]) -> list[SeedPoint]:
    sanitized: list[SeedPoint] = []

    for point in points:
        rounded = _round_point(point)
        if sanitized and _points_equal(sanitized[-1], rounded):
            continue
        sanitized.append(rounded)

    if len(sanitized) >= 2 and _points_equal(sanitized[0], sanitized[-1]):
        sanitized.pop()

    return sanitized


def _clamp_point(point: SeedPoint, *, width: int, height: int) -> SeedPoint:
    return SeedPoint(
        x=round(min(max(point.x, 0.0), float(width)), 2),
        y=round(min(max(point.y, 0.0), float(height)), 2),
    )


def _polygon_area(points: list[SeedPoint]) -> float:
    if len(points) < 3:
        return 0.0

    area = 0.0
    for index, point in enumerate(points):
        next_point = points[(index + 1) % len(points)]
        area += point.x * next_point.y - next_point.x * point.y
    return abs(area) / 2.0


def _perpendicular_distance(point: SeedPoint, start: SeedPoint, end: SeedPoint) -> float:
    if _points_equal(start, end):
        return ((point.x - start.x) ** 2 + (point.y - start.y) ** 2) ** 0.5

    numerator = abs(
        (end.y - start.y) * point.x
        - (end.x - start.x) * point.y
        + end.x * start.y
        - end.y * start.x
    )
    denominator = ((end.y - start.y) ** 2 + (end.x - start.x) ** 2) ** 0.5
    return numerator / denominator


def _rdp(points: list[SeedPoint], tolerance: float) -> list[SeedPoint]:
    if len(points) <= 2:
        return points[:]

    start = points[0]
    end = points[-1]
    max_distance = -1.0
    split_index = -1

    for index in range(1, len(points) - 1):
        distance = _perpendicular_distance(points[index], start, end)
        if distance > max_distance:
            max_distance = distance
            split_index = index

    if max_distance <= tolerance or split_index == -1:
        return [start, end]

    left = _rdp(points[: split_index + 1], tolerance)
    right = _rdp(points[split_index:], tolerance)
    return left[:-1] + right


def _rotate_points(points: list[SeedPoint], anchor_index: int) -> list[SeedPoint]:
    return points[anchor_index:] + points[:anchor_index]


def _simplify_closed_polygon(points: list[SeedPoint], tolerance: float) -> list[SeedPoint]:
    if len(points) <= 3:
        return points[:]

    anchor_index = min(range(len(points)), key=lambda index: (points[index].x, points[index].y, index))
    rotated = _rotate_points(points, anchor_index)

    split_index = max(
        range(1, len(rotated)),
        key=lambda index: (
            (rotated[index].x - rotated[0].x) ** 2 + (rotated[index].y - rotated[0].y) ** 2,
            -index,
        ),
    )

    first_chain = _rdp(rotated[: split_index + 1], tolerance)
    second_chain = _rdp(rotated[split_index:] + [rotated[0]], tolerance)
    simplified = first_chain[:-1] + second_chain[:-1]

    deduped: list[SeedPoint] = []
    for point in simplified:
        if deduped and _points_equal(deduped[-1], point):
            continue
        deduped.append(point)

    if len(deduped) >= 2 and _points_equal(deduped[0], deduped[-1]):
        deduped.pop()

    return deduped


def normalize_seed_polygon(
    polygon: tuple[SeedPoint, ...],
    *,
    width: int,
    height: int,
    tolerance: float = SALIENT_TBI_SIMPLIFY_TOLERANCE_PX,
    max_vertices: int = SALIENT_TBI_MAX_POLYGON_VERTICES,
) -> list[dict[str, float]]:
    points = [_clamp_point(point, width=width, height=height) for point in polygon]
    sanitized = _sanitize_points(tuple(points))
    if len(sanitized) < 3:
        raise SeedImportError("Polygon became degenerate after clamping/deduplication.")

    current_points = sanitized
    current_tolerance = tolerance

    while True:
        simplified = _simplify_closed_polygon(current_points, current_tolerance)
        simplified = _sanitize_points(tuple(simplified))

        if len(simplified) < 3:
            raise SeedImportError("Polygon became degenerate during simplification.")

        if _polygon_area(simplified) < MIN_POLYGON_AREA:
            raise SeedImportError("Polygon area is too small after simplification.")

        if len(simplified) <= max_vertices:
            return [{"x": point.x, "y": point.y} for point in simplified]

        current_tolerance *= 2.0
        if current_tolerance > 512:
            raise SeedImportError(
                f"Polygon exceeds the {max_vertices}-vertex cap after deterministic simplification."
            )


def _extract_pre_annotation_metadata(task: Task) -> dict[str, Any]:
    payload = task.payload if isinstance(task.payload, dict) else {}
    pre_annotations = payload.get("pre_annotations")
    if not isinstance(pre_annotations, dict):
        return {}

    metadata = pre_annotations.get("metadata")
    return metadata if isinstance(metadata, dict) else {}


def _is_stale_existing_seed(task: Task, batch: SalientTbiSeedBatch) -> bool:
    metadata = _extract_pre_annotation_metadata(task)
    if not metadata:
        return True

    return (
        metadata.get("provider") != batch.provider
        or metadata.get("checkpoint") != batch.checkpoint
    )


def _build_pre_annotations_payload(
    *,
    batch: SalientTbiSeedBatch,
    proposal: SalientTbiSeedProposal,
    normalized_polygon: list[dict[str, float]],
) -> dict[str, Any]:
    return {
        "pre_annotations": {
            "schema_version": PRE_ANNOTATIONS_SCHEMA_VERSION,
            "metadata": {
                "provider": batch.provider,
                "checkpoint": batch.checkpoint,
                "run_id": batch.run_id,
            },
            "predictions": [
                {
                    "id": proposal.proposal_id,
                    "kind": "polygon",
                    "label": SALIENT_TBI_POLYGON_LABEL,
                    "score": proposal.score,
                    "points": normalized_polygon,
                }
            ],
        }
    }


def import_salient_tbi_seed_batch(
    batch: SalientTbiSeedBatch,
    *,
    dry_run: bool = False,
    overwrite_stale: bool = False,
    overwrite_existing: bool = False,
) -> SalientTbiSeedImportSummary:
    if overwrite_stale and overwrite_existing:
        raise SeedImportError("Use only one overwrite mode at a time.")

    task_ids = [proposal.task_id for proposal in batch.proposals]
    tasks = Task.objects.select_related("asset", "task_definition__task_type").filter(
        id__in=task_ids
    )
    tasks_by_id = {task.id: task for task in tasks}

    summary = SalientTbiSeedImportSummary(proposals_seen=len(batch.proposals))

    with transaction.atomic():
        for proposal in batch.proposals:
            task = tasks_by_id.get(proposal.task_id)
            if task is None:
                summary = _bump_summary(
                    summary,
                    skipped_missing_task=summary.skipped_missing_task + 1,
                )
                continue

            if task.task_definition.task_type.slug != SALIENT_TBI_TASK_TYPE_SLUG:
                summary = _bump_summary(
                    summary,
                    skipped_wrong_task_type=summary.skipped_wrong_task_type + 1,
                )
                continue

            if not task.asset.width or not task.asset.height:
                summary = _bump_summary(
                    summary,
                    skipped_missing_asset_dimensions=summary.skipped_missing_asset_dimensions + 1,
                )
                continue

            try:
                normalized_polygon = normalize_seed_polygon(
                    proposal.polygon,
                    width=task.asset.width,
                    height=task.asset.height,
                )
            except SeedImportError:
                summary = _bump_summary(
                    summary,
                    skipped_invalid_polygon=summary.skipped_invalid_polygon + 1,
                )
                continue

            payload = task.payload.copy() if isinstance(task.payload, dict) else {}
            has_existing_pre_annotations = isinstance(payload.get("pre_annotations"), dict)
            stale_existing = has_existing_pre_annotations and _is_stale_existing_seed(
                task, batch
            )

            if has_existing_pre_annotations:
                if overwrite_existing:
                    pass
                elif overwrite_stale and stale_existing:
                    pass
                elif stale_existing:
                    summary = _bump_summary(
                        summary,
                        skipped_stale=summary.skipped_stale + 1,
                    )
                    continue
                else:
                    summary = _bump_summary(
                        summary,
                        skipped_existing=summary.skipped_existing + 1,
                    )
                    continue

            next_payload = {
                **payload,
                **_build_pre_annotations_payload(
                    batch=batch,
                    proposal=proposal,
                    normalized_polygon=normalized_polygon,
                ),
            }

            if not dry_run:
                task.payload = next_payload
                task.save(update_fields=["payload"])

            summary = _bump_summary(
                summary,
                created=summary.created + (0 if has_existing_pre_annotations else 1),
                updated=summary.updated + (1 if has_existing_pre_annotations else 0),
            )

        if dry_run:
            transaction.set_rollback(True)

    log_event(
        "SALIENT_TBI_SEED_IMPORT",
        actor="management-command",
        payload={
            "provider": batch.provider,
            "checkpoint": batch.checkpoint,
            "run_id": batch.run_id,
            "dry_run": dry_run,
            "overwrite_stale": overwrite_stale,
            "overwrite_existing": overwrite_existing,
            **summary.as_dict(),
        },
    )

    return summary
