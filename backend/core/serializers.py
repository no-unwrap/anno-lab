import uuid

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import (
    Annotation,
    Asset,
    Assignment,
    FrontendPlugin,
    Project,
    Task,
    TaskDefinition,
    TaskType,
)
from .plugin_validation import validate_plugin_manifest


class ProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = ["id", "slug", "name", "description", "created_at"]


class AssetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Asset
        fields = [
            "id",
            "project",
            "media_type",
            "s3_key",
            "sha256",
            "width",
            "height",
            "metadata",
            "created_at",
        ]


class TaskTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskType
        fields = ["id", "slug", "name", "description"]


class TaskDefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskDefinition
        fields = ["id", "task_type", "version", "definition", "created_at"]


class TaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        fields = [
            "id",
            "project",
            "asset",
            "task_definition",
            "status",
            "priority",
            "assigned_to",
            "payload",
            "created_at",
        ]


class AnnotationSerializer(serializers.ModelSerializer):
    submission_id = serializers.CharField(required=False, allow_blank=True)
    assignment = serializers.PrimaryKeyRelatedField(
        queryset=Assignment.objects.all(),
        required=False,
        allow_null=True,
    )
    raw_payload = serializers.JSONField(required=False)

    class Meta:
        model = Annotation
        validators = []
        fields = [
            "id",
            "task",
            "result",
            "schema_version",
            "tool_version",
            "created_at",
            "actor",
            "submission_id",
            "assignment",
            "raw_payload",
        ]

    def validate(self, attrs):
        if not attrs.get("submission_id"):
            attrs["submission_id"] = uuid.uuid4().hex
        if "raw_payload" not in attrs or attrs["raw_payload"] is None:
            attrs["raw_payload"] = {}
        assignment = attrs.get("assignment")
        task = attrs.get("task")
        if assignment and task and assignment.task_id != task.id:
            raise serializers.ValidationError(
                {"assignment": "Assignment does not belong to task."}
            )
        return attrs


class AssignmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Assignment
        fields = [
            "id",
            "task",
            "backend",
            "hit_id",
            "assignment_id",
            "worker_id",
            "status",
            "sandbox",
            "created_at",
            "updated_at",
            "payload",
            "last_polled_at",
            "ingested_at",
        ]


class FrontendPluginSerializer(serializers.ModelSerializer):
    class Meta:
        model = FrontendPlugin
        fields = [
            "id",
            "task_type",
            "name",
            "version",
            "manifest",
            "is_active",
            "created_at",
        ]

    def validate(self, attrs):
        manifest = attrs.get("manifest") or {}
        try:
            manifest = validate_plugin_manifest(manifest)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"manifest": exc.messages})
        attrs["manifest"] = manifest
        task_type = attrs.get("task_type") or getattr(self.instance, "task_type", None)
        manifest_task_type = manifest.get("task_type")
        if task_type and manifest_task_type and manifest_task_type != task_type.slug:
            raise serializers.ValidationError(
                {
                    "manifest": f"Manifest task_type ({manifest_task_type}) does not match plugin task_type ({task_type.slug})."
                }
            )
        return attrs
