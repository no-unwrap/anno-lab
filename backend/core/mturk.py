from __future__ import annotations

import json
import logging
import re
import uuid
import xml.etree.ElementTree as ET
from typing import Dict, Iterable, List, Optional

from celery import shared_task
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from .adapters.mturk.client import get_mturk_client
from .adapters.mturk.templates import external_question_xml
from .models import Annotation, Assignment, Task, log_event
from .serializers import AnnotationSerializer

logger = logging.getLogger(__name__)
POLL_PAGE_SIZE = 100


def _public_mturk_url(task_id: int) -> str:
    sandbox_flag = "1" if settings.MTURK_SANDBOX else "0"
    return f"{settings.PUBLIC_BASE_URL}/api/tasks/{task_id}/annotate/mturk/?sandbox={sandbox_flag}"


def _chunked(seq: Iterable, size: int) -> Iterable[List]:
    chunk: List = []
    for item in seq:
        chunk.append(item)
        if len(chunk) >= size:
            yield chunk
            chunk = []
    if chunk:
        yield chunk


def _create_assignment_record(task: Task, hit_id: str, params: Dict) -> None:
    Assignment.objects.create(
        task=task,
        backend="mturk",
        hit_id=hit_id,
        status="created",
        sandbox=settings.MTURK_SANDBOX,
        payload={"creation": params},
    )


def _create_hit(
    task: Task, reward: str, max_assignments: int, lifetime_seconds: int
) -> str:
    client = get_mturk_client()
    url = _public_mturk_url(task.id)
    question = external_question_xml(url=url, frame_height=950)
    resp = client.create_hit(
        Title=f"{task.task_definition.task_type.name} annotation",
        Description="Complete the annotation task in the external UI.",
        Keywords="image, annotation",
        Reward=reward,
        AssignmentDurationInSeconds=1800,
        LifetimeInSeconds=lifetime_seconds,
        MaxAssignments=max_assignments,
        Question=question,
    )
    hit = resp["HIT"]
    hit_id = hit["HITId"]
    params = {
        "reward": reward,
        "max_assignments": max_assignments,
        "lifetime_seconds": lifetime_seconds,
    }
    with transaction.atomic():
        _create_assignment_record(task, hit_id, params)
        log_event(
            "MTURK_HIT_CREATED", payload={"task_id": task.id, "hit_id": hit_id, **params}
        )
    logger.info("MTurk HIT %s created for task %s", hit_id, task.id)
    return hit_id


@shared_task(
    bind=True,
    name="core.mturk.create_hit_for_task",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 5},
)
def create_hit_for_task(
    self,
    task_id: int,
    reward: str = "0.10",
    max_assignments: int = 1,
    lifetime_seconds: int = 86400,
):
    task = Task.objects.select_related("task_definition__task_type").get(pk=task_id)
    return {"hit_id": _create_hit(task, reward, max_assignments, lifetime_seconds)}


@shared_task(
    bind=True,
    name="core.mturk.create_hits_for_tasks",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 5},
)
def create_hits_for_tasks(
    self,
    task_ids: List[int],
    reward: str = "0.10",
    max_assignments: int = 1,
    lifetime_seconds: int = 86400,
    batch_size: int = 25,
):
    tasks = list(
        Task.objects.select_related("task_definition__task_type")
        .filter(pk__in=task_ids)
        .order_by("id")
    )
    created = []
    skipped = []
    for chunk in _chunked(tasks, batch_size):
        for task in chunk:
            existing = Assignment.objects.filter(
                task=task,
                backend="mturk",
                status__in=["created", "submitted"],
            ).exists()
            if existing:
                skipped.append(task.id)
                logger.info(
                    "Skipping HIT creation for task %s (active assignment exists)",
                    task.id,
                )
                continue
            hit_id = _create_hit(task, reward, max_assignments, lifetime_seconds)
            created.append({"task_id": task.id, "hit_id": hit_id})
    return {"created": created, "skipped": skipped}


def _map_assignment_status(status: str) -> str:
    status = (status or "").lower()
    if status == "approved":
        return "approved"
    if status == "rejected":
        return "rejected"
    if status == "returned":
        return "returned"
    if status == "expired":
        return "expired"
    return "submitted"


def _strip_namespaces(xml_text: str) -> str:
    return re.sub(r'xmlns(:\w+)?="[^"]+"', "", xml_text or "")


def _parse_mturk_answers(answer_xml: str) -> Dict[str, object]:
    if not answer_xml:
        return {"fields": {}}
    try:
        parsed = ET.fromstring(_strip_namespaces(answer_xml))
    except ET.ParseError:
        logger.warning("Failed to parse MTurk Answer XML")
        return {"fields": {}, "raw": answer_xml}

    answers: Dict[str, str] = {}
    for answer in parsed.findall(".//Answer"):
        key = answer.findtext("QuestionIdentifier") or ""
        value = answer.findtext("FreeText") or ""
        if key:
            answers[key] = value

    out: Dict[str, object] = {"fields": answers, "raw": answer_xml}
    annotation_value = answers.get("annotation")
    if annotation_value:
        try:
            out["annotation_json"] = json.loads(annotation_value)
        except json.JSONDecodeError:
            logger.warning("Failed to decode annotation JSON from MTurk Answer")
    return out


def _update_assignment_from_record(obj: Assignment, record: Dict) -> bool:
    aid = record.get("AssignmentId", "")
    wid = record.get("WorkerId", "")
    remote_status = record.get("AssignmentStatus", "")
    mapped_status = _map_assignment_status(remote_status)
    answer_blob = _parse_mturk_answers(record.get("Answer", ""))
    now = timezone.now()

    dirty_fields: List[str] = []
    if wid and obj.worker_id != wid:
        obj.worker_id = wid
        dirty_fields.append("worker_id")
    if obj.status != mapped_status:
        obj.status = mapped_status
        dirty_fields.append("status")

    payload = obj.payload or {}
    new_payload = dict(payload)
    new_payload["mturk_record"] = record
    new_payload["answers"] = answer_blob.get("fields", {})
    if "annotation_json" in answer_blob:
        new_payload["annotation_json"] = answer_blob["annotation_json"]
    if payload != new_payload:
        obj.payload = new_payload
        dirty_fields.append("payload")

    obj.last_polled_at = now
    dirty_fields.append("last_polled_at")
    if dirty_fields:
        dirty_fields.append("updated_at")
        obj.updated_at = now
        obj.save(update_fields=dirty_fields)
        log_event(
            "MTURK_ASSIGNMENT_SYNCED",
            payload={
                "assignment_id": aid,
                "task_id": obj.task_id,
                "status": obj.status,
            },
        )
        return True
    return False


def _sync_assignments(hit_id: str) -> Dict[str, int]:
    base_assignment = (
        Assignment.objects.filter(hit_id=hit_id).order_by("created_at").first()
    )
    if not base_assignment:
        logger.warning("No assignment record found for HIT %s", hit_id)
        return {"seen": 0, "updated": 0}

    client = get_mturk_client()
    paginator = client.get_paginator("list_assignments_for_hit")
    seen = 0
    updated = 0
    for page in paginator.paginate(
        HITId=hit_id,
        AssignmentStatuses=["Submitted", "Approved", "Rejected"],
        MaxResults=POLL_PAGE_SIZE,
    ):
        for record in page.get("Assignments", []):
            aid = record.get("AssignmentId")
            if not aid:
                continue
            seen += 1
            obj, _ = Assignment.objects.get_or_create(
                backend="mturk",
                assignment_id=aid,
                defaults={
                    "task": base_assignment.task,
                    "hit_id": hit_id,
                    "sandbox": settings.MTURK_SANDBOX,
                },
            )
            if _update_assignment_from_record(obj, record):
                updated += 1
    return {"seen": seen, "updated": updated}


@shared_task(
    bind=True,
    name="core.mturk.sync_assignments_for_hit",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 5},
)
def sync_assignments_for_hit(self, hit_id: str):
    return _sync_assignments(hit_id)


@shared_task(
    bind=True,
    name="core.mturk.sync_open_hits",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 5},
)
def sync_open_hits(self, limit: int = 25):
    hit_ids = (
        Assignment.objects.filter(
            backend="mturk",
            status__in=["created", "submitted"],
            sandbox=settings.MTURK_SANDBOX,
        )
        .exclude(hit_id="")
        .order_by("updated_at")
        .values_list("hit_id", flat=True)
        .distinct()[:limit]
    )
    totals = {"hits": 0, "assignments_seen": 0, "assignments_updated": 0}
    for hit_id in hit_ids:
        res = _sync_assignments(hit_id)
        totals["hits"] += 1
        totals["assignments_seen"] += res["seen"]
        totals["assignments_updated"] += res["updated"]
    return totals


def _build_annotation_payload(assignment: Assignment) -> Optional[Dict]:
    annotation_json = (assignment.payload or {}).get("annotation_json")
    if not annotation_json:
        return None
    payload = dict(annotation_json)
    payload["task"] = assignment.task_id
    payload["submission_id"] = (
        payload.get("submission_id") or assignment.assignment_id or uuid.uuid4().hex
    )
    payload["assignment"] = assignment.id
    raw = dict(assignment.payload or {})
    raw["ingested_via"] = "mturk"
    payload["raw_payload"] = raw
    return payload


@shared_task(
    bind=True,
    name="core.mturk.ingest_submitted_assignments",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 5},
)
def ingest_submitted_assignments(self, limit: int = 20):
    qs = (
        Assignment.objects.select_related("task")
        .filter(
            backend="mturk",
            status__in=["submitted", "approved"],
            ingested_at__isnull=True,
        )
        .order_by("updated_at")[:limit]
    )
    ingested = 0
    skipped = 0
    for assignment in qs:
        data = _build_annotation_payload(assignment)
        if not data:
            skipped += 1
            continue
        submission_id = data.get("submission_id")
        if (
            submission_id
            and Annotation.objects.filter(
                task=assignment.task, submission_id=submission_id
            ).exists()
        ):
            assignment.ingested_at = timezone.now()
            assignment.updated_at = assignment.ingested_at
            assignment.save(update_fields=["ingested_at", "updated_at"])
            skipped += 1
            continue
        serializer = AnnotationSerializer(data=data)
        try:
            serializer.is_valid(raise_exception=True)
            annotation = serializer.save()
        except serializers.ValidationError as exc:
            logger.warning(
                "Failed to ingest assignment %s: %s",
                assignment.assignment_id,
                exc.detail,
            )
            continue
        assignment.ingested_at = annotation.created_at
        assignment.updated_at = timezone.now()
        assignment.status = assignment.status or "submitted"
        assignment.save(update_fields=["ingested_at", "updated_at", "status"])
        log_event(
            "MTURK_ASSIGNMENT_INGESTED",
            payload={
                "task_id": assignment.task_id,
                "assignment_id": assignment.assignment_id,
                "annotation_id": annotation.id,
            },
        )
        ingested += 1
    return {"ingested": ingested, "skipped": skipped}
