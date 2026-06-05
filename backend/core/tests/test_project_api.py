import json
from datetime import timedelta

import pytest
from django.test import Client, override_settings
from django.utils import timezone

from core.exports import ExportError, build_project_raw_collection_export
from core.models import Annotation, Asset, Assignment, Project, Task, TaskDefinition, TaskType


@pytest.mark.django_db
class TestProjectExportStats:
    def setup_method(self):
        self.client = Client()
        self.project = Project.objects.create(slug="project-a", name="Project A")
        self.other_project = Project.objects.create(slug="project-b", name="Project B")
        self.task_type = TaskType.objects.create(slug="bbox", name="Bounding Box")
        self.task_definition = TaskDefinition.objects.create(
            task_type=self.task_type,
            version="1.0",
            definition={"object_classes": ["cat", "dog", "bird"]},
        )

        self.pending_task = self._create_task(
            self.project,
            status="pending",
            s3_key="project-a/pending.jpg",
        )
        self.in_progress_task = self._create_task(
            self.project,
            status="in_progress",
            s3_key="project-a/in-progress.jpg",
        )
        self.complete_task = self._create_task(
            self.project,
            status="complete",
            s3_key="project-a/complete.jpg",
        )
        self.failed_task = self._create_task(
            self.project,
            status="failed",
            s3_key="project-a/failed.jpg",
        )
        self.other_task = self._create_task(
            self.other_project,
            status="pending",
            s3_key="project-b/only.jpg",
        )

        self.created_assignment = Assignment.objects.create(
            task=self.pending_task,
            hit_id="hit-created",
            assignment_id="assignment-created",
            status="created",
            payload={"creation": {"reward": "0.10", "max_assignments": 1}},
        )
        self.submitted_assignment = Assignment.objects.create(
            task=self.pending_task,
            hit_id="hit-submitted",
            assignment_id="assignment-submitted",
            worker_id="worker-1",
            status="submitted",
            payload={
                "mturk_record": {
                    "AssignmentId": "assignment-submitted",
                    "WorkerId": "worker-1",
                    "HITId": "hit-submitted",
                },
                "answers": {"annotation": '{"result":{"label":"cat"}}'},
                "annotation_json": {"result": {"label": "cat"}},
            },
        )
        self.approved_assignment = Assignment.objects.create(
            task=self.in_progress_task,
            hit_id="hit-approved",
            assignment_id="assignment-approved",
            status="approved",
        )
        self.rejected_assignment = Assignment.objects.create(
            task=self.complete_task,
            assignment_id="assignment-rejected",
            status="rejected",
        )
        self.returned_assignment = Assignment.objects.create(
            task=self.complete_task,
            assignment_id="assignment-returned",
            status="returned",
        )
        self.expired_assignment = Assignment.objects.create(
            task=self.failed_task,
            assignment_id="assignment-expired",
            status="expired",
        )

        created_at = timezone.now()
        self.annotation_one = Annotation.objects.create(
            task=self.pending_task,
            result={"label": "cat"},
            schema_version="1.0.0",
            tool_version="tool-1",
            actor="worker-1",
            submission_id="submission-1",
            assignment=self.submitted_assignment,
            raw_payload={
                "ingested_via": "mturk",
                "annotation_json": {"result": {"label": "cat"}},
                "mturk_record": {
                    "AssignmentId": "assignment-submitted",
                    "WorkerId": "worker-1",
                },
            },
            created_at=created_at + timedelta(seconds=1),
        )
        self.annotation_two = Annotation.objects.create(
            task=self.pending_task,
            result={"label": "dog"},
            schema_version="1.0.0",
            tool_version="tool-1",
            actor="worker-1",
            submission_id="submission-2",
            raw_payload={"source": "direct-api"},
            created_at=created_at + timedelta(seconds=2),
        )
        self.annotation_three = Annotation.objects.create(
            task=self.complete_task,
            result={"label": "bird"},
            schema_version="1.0.0",
            tool_version="tool-2",
            actor="",
            submission_id="submission-3",
            assignment=self.rejected_assignment,
            created_at=created_at,
        )
        self.other_annotation = Annotation.objects.create(
            task=self.other_task,
            result={"label": "fish"},
            schema_version="1.0.0",
            tool_version="tool-3",
            actor="worker-2",
            submission_id="submission-4",
            created_at=created_at + timedelta(seconds=3),
        )

    def _create_task(self, project, status, s3_key):
        asset = Asset.objects.create(
            project=project,
            media_type="image",
            s3_key=s3_key,
            width=640,
            height=480,
        )
        return Task.objects.create(
            project=project,
            asset=asset,
            task_definition=self.task_definition,
            status=status,
        )

    @override_settings(WRITE_TOKEN="secret-token")
    def test_stats_is_project_scoped_and_public_read(self):
        response = self.client.get(f"/api/projects/{self.project.id}/stats/")

        assert response.status_code == 200
        assert response.json() == {
            "project_id": self.project.id,
            "project_slug": self.project.slug,
            "tasks": {
                "total": 4,
                "pending": 1,
                "in_progress": 1,
                "complete": 1,
                "failed": 1,
            },
            "annotations": {
                "total": 3,
                "unique_actors": 1,
            },
            "assignments": {
                "total": 6,
                "created": 1,
                "submitted": 1,
                "approved": 1,
                "rejected": 1,
                "returned": 1,
                "expired": 1,
            },
        }

        other_response = self.client.get(f"/api/projects/{self.other_project.id}/stats/")

        assert other_response.status_code == 200
        assert other_response.json() == {
            "project_id": self.other_project.id,
            "project_slug": self.other_project.slug,
            "tasks": {
                "total": 1,
                "pending": 1,
                "in_progress": 0,
                "complete": 0,
                "failed": 0,
            },
            "annotations": {
                "total": 1,
                "unique_actors": 1,
            },
            "assignments": {
                "total": 0,
                "created": 0,
                "submitted": 0,
                "approved": 0,
                "rejected": 0,
                "returned": 0,
                "expired": 0,
            },
        }

    @override_settings(WRITE_TOKEN="secret-token")
    def test_export_requires_operator_token(self):
        response = self.client.get(f"/api/projects/{self.project.id}/export/")

        assert response.status_code == 403

        authorized_response = self.client.get(
            f"/api/projects/{self.project.id}/export/",
            HTTP_X_ANNO_LAB_WRITE_TOKEN="secret-token",
        )

        assert authorized_response.status_code == 200

    @override_settings(WRITE_TOKEN="secret-token")
    def test_export_default_json_is_project_scoped_and_preserves_raw_collection_state(self):
        response = self.client.get(
            f"/api/projects/{self.project.id}/export/",
            HTTP_X_ANNO_LAB_WRITE_TOKEN="secret-token",
        )

        assert response.status_code == 200
        assert response["Content-Type"].startswith("application/json")
        assert (
            response["Content-Disposition"]
            == f'attachment; filename="{self.project.slug}_raw_collection_export.json"'
        )

        payload = json.loads(response.content)

        assert payload["export_contract"] == "anno_lab_raw_collection_export"
        assert payload["export_version"] == "1.0.0"
        assert payload["project"] == {
            "id": self.project.id,
            "slug": self.project.slug,
            "name": self.project.name,
            "description": self.project.description,
            "created_at": self.project.created_at.isoformat(),
        }
        assert payload["summary"] == {
            "asset_count": 4,
            "task_count": 4,
            "assignment_count": 6,
            "annotation_count": 3,
        }
        assert [task_type["slug"] for task_type in payload["task_types"]] == ["bbox"]
        assert payload["task_definitions"] == [
            {
                "id": self.task_definition.id,
                "task_type_id": self.task_type.id,
                "version": "1.0",
                "definition": {"object_classes": ["cat", "dog", "bird"]},
                "created_at": self.task_definition.created_at.isoformat(),
            }
        ]
        assert [asset["id"] for asset in payload["assets"]] == [
            self.pending_task.asset_id,
            self.in_progress_task.asset_id,
            self.complete_task.asset_id,
            self.failed_task.asset_id,
        ]
        assert [task["id"] for task in payload["tasks"]] == [
            self.pending_task.id,
            self.in_progress_task.id,
            self.complete_task.id,
            self.failed_task.id,
        ]

        submitted_assignment = next(
            assignment
            for assignment in payload["assignments"]
            if assignment["id"] == self.submitted_assignment.id
        )
        assert submitted_assignment == {
            "id": self.submitted_assignment.id,
            "task_id": self.pending_task.id,
            "backend": "mturk",
            "hit_id": "hit-submitted",
            "assignment_id": "assignment-submitted",
            "worker_id": "worker-1",
            "status": "submitted",
            "sandbox": True,
            "payload": {
                "mturk_record": {
                    "AssignmentId": "assignment-submitted",
                    "WorkerId": "worker-1",
                    "HITId": "hit-submitted",
                },
                "answers": {"annotation": '{"result":{"label":"cat"}}'},
                "annotation_json": {"result": {"label": "cat"}},
            },
            "last_polled_at": None,
            "ingested_at": None,
            "created_at": self.submitted_assignment.created_at.isoformat(),
            "updated_at": self.submitted_assignment.updated_at.isoformat(),
        }

        annotation_one = next(
            annotation
            for annotation in payload["annotations"]
            if annotation["id"] == self.annotation_one.id
        )
        assert annotation_one == {
            "id": self.annotation_one.id,
            "task_id": self.pending_task.id,
            "assignment_id": self.submitted_assignment.id,
            "result": {"label": "cat"},
            "schema_version": "1.0.0",
            "tool_version": "tool-1",
            "actor": "worker-1",
            "submission_id": "submission-1",
            "raw_payload": {
                "ingested_via": "mturk",
                "annotation_json": {"result": {"label": "cat"}},
                "mturk_record": {
                    "AssignmentId": "assignment-submitted",
                    "WorkerId": "worker-1",
                },
            },
            "created_at": self.annotation_one.created_at.isoformat(),
        }
        assert all(
            assignment["task_id"] != self.other_task.id for assignment in payload["assignments"]
        )
        assert all(
            annotation["task_id"] != self.other_task.id for annotation in payload["annotations"]
        )

    @override_settings(WRITE_TOKEN="secret-token")
    def test_export_invalid_export_format(self):
        invalid_response = self.client.get(
            f"/api/projects/{self.project.id}/export/?export_format=jsonl",
            HTTP_X_ANNO_LAB_WRITE_TOKEN="secret-token",
        )

        assert invalid_response.status_code == 400
        assert invalid_response.json() == {"error": "Invalid format. Supported: json"}


@pytest.mark.django_db
def test_raw_collection_export_builder_preserves_mturk_snapshots() -> None:
    project = Project.objects.create(slug="raw-export", name="Raw Export")
    task_type = TaskType.objects.create(slug="instance_bbox", name="Instance Bounding Box")
    task_definition = TaskDefinition.objects.create(
        task_type=task_type,
        version="1.0.0",
        definition={"object_classes": ["person"]},
    )
    asset = Asset.objects.create(
        project=project,
        media_type="image",
        s3_key="exports/asset-001.jpg",
        width=640,
        height=480,
        metadata={"source_dataset": "demo"},
    )
    task = Task.objects.create(
        project=project,
        asset=asset,
        task_definition=task_definition,
        payload={"batch": "mturk-wave-1"},
    )
    assignment = Assignment.objects.create(
        task=task,
        backend="mturk",
        hit_id="HIT-001",
        assignment_id="ASSIGNMENT-001",
        worker_id="WORKER-001",
        status="approved",
        payload={
            "creation": {"reward": "0.10"},
            "mturk_record": {"AssignmentId": "ASSIGNMENT-001", "WorkerId": "WORKER-001"},
            "answers": {"annotation": '{"result":{"label":"person"}}'},
        },
    )
    annotation = Annotation.objects.create(
        task=task,
        assignment=assignment,
        result={"label": "person"},
        schema_version="1.0.0",
        tool_version="instance-bbox@0.1.0",
        actor="WORKER-001",
        submission_id="ASSIGNMENT-001",
        raw_payload={
            "ingested_via": "mturk",
            "mturk_record": {"AssignmentId": "ASSIGNMENT-001", "WorkerId": "WORKER-001"},
        },
    )

    payload = build_project_raw_collection_export(project)

    assert payload["summary"] == {
        "asset_count": 1,
        "task_count": 1,
        "assignment_count": 1,
        "annotation_count": 1,
    }
    assert payload["tasks"] == [
        {
            "id": task.id,
            "project_id": project.id,
            "asset_id": asset.id,
            "task_definition_id": task_definition.id,
            "status": "pending",
            "priority": 0,
            "assigned_to": "",
            "payload": {"batch": "mturk-wave-1"},
            "created_at": task.created_at.isoformat(),
        }
    ]
    assert payload["assignments"][0]["payload"]["mturk_record"]["WorkerId"] == "WORKER-001"
    assert payload["annotations"] == [
        {
            "id": annotation.id,
            "task_id": task.id,
            "assignment_id": assignment.id,
            "result": {"label": "person"},
            "schema_version": "1.0.0",
            "tool_version": "instance-bbox@0.1.0",
            "actor": "WORKER-001",
            "submission_id": "ASSIGNMENT-001",
            "raw_payload": {
                "ingested_via": "mturk",
                "mturk_record": {
                    "AssignmentId": "ASSIGNMENT-001",
                    "WorkerId": "WORKER-001",
                },
            },
            "created_at": annotation.created_at.isoformat(),
        }
    ]


@pytest.mark.django_db
def test_raw_collection_export_builder_requires_positive_image_dimensions() -> None:
    project = Project.objects.create(slug="missing-dimensions", name="Missing Dimensions")
    task_type = TaskType.objects.create(slug="instance_bbox", name="Instance Bounding Box")
    task_definition = TaskDefinition.objects.create(
        task_type=task_type,
        version="1.0.0",
        definition={"object_classes": ["person"]},
    )
    asset = Asset.objects.create(
        project=project,
        media_type="image",
        s3_key="exports/missing-dimensions.jpg",
        height=480,
    )
    task = Task.objects.create(
        project=project,
        asset=asset,
        task_definition=task_definition,
    )
    Annotation.objects.create(
        task=task,
        result={
            "objects": [
                {
                    "id": "box-1",
                    "label": "person",
                    "bbox": {"x": 8, "y": 12, "width": 32, "height": 48},
                }
            ]
        },
        schema_version="1.0.0",
    )

    with pytest.raises(
        ExportError,
        match="must include a positive width for raw collection export",
    ):
        build_project_raw_collection_export(project)
