from __future__ import annotations

from django.core.validators import MinLengthValidator
from django.db import models
from django.utils import timezone


class Project(models.Model):
    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    def __str__(self) -> str:
        return self.slug


class Asset(models.Model):
    MEDIA_CHOICES = [
        ("image", "image"),
        ("video_frame", "video_frame"),
    ]
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="assets"
    )
    media_type = models.CharField(max_length=20, choices=MEDIA_CHOICES, default="image")
    s3_key = models.CharField(
        max_length=512, help_text="S3 object key (not a presigned URL)."
    )
    sha256 = models.CharField(
        max_length=64, blank=True, help_text="Optional content hash."
    )
    width = models.IntegerField(null=True, blank=True)
    height = models.IntegerField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        indexes = [
            models.Index(fields=["project", "media_type"], name="asset_proj_media_idx"),
        ]

    def presigned_url(self, expiration: int = 3600) -> str:
        """
        Generate a presigned S3 URL for this asset.

        Args:
            expiration: URL expiration time in seconds (default 1 hour)

        Returns:
            Presigned S3 URL

        Raises:
            ValueError: If S3_BUCKET setting is not configured
            ImportError: If boto3 is not installed
        """
        import boto3
        from django.conf import settings

        if not hasattr(settings, 'S3_BUCKET') or not settings.S3_BUCKET:
            raise ValueError('S3_BUCKET setting is required for presigned URLs')

        if not self.s3_key:
            raise ValueError(f'Asset {self.id} has no s3_key')

        s3_client = boto3.client(
            's3',
            region_name=getattr(settings, 'AWS_REGION', 'us-east-1'),
        )

        return s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': settings.S3_BUCKET, 'Key': self.s3_key},
            ExpiresIn=expiration,
        )


class TaskType(models.Model):
    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)

    def __str__(self) -> str:
        return self.slug


class TaskDefinition(models.Model):
    """Versioned definition for a task type (label schema, UI config, validation)."""

    task_type = models.ForeignKey(
        TaskType, on_delete=models.CASCADE, related_name="definitions"
    )
    version = models.CharField(max_length=32, validators=[MinLengthValidator(1)])
    definition = models.JSONField(default=dict)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        unique_together = [("task_type", "version")]
        indexes = [
            models.Index(fields=["task_type", "version"], name="taskdef_type_ver_idx"),
        ]


class Task(models.Model):
    STATUS = [
        ("pending", "pending"),
        ("in_progress", "in_progress"),
        ("complete", "complete"),
        ("failed", "failed"),
    ]
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="tasks")
    asset = models.ForeignKey(Asset, on_delete=models.CASCADE, related_name="tasks")
    task_definition = models.ForeignKey(
        TaskDefinition, on_delete=models.PROTECT, related_name="tasks"
    )
    status = models.CharField(max_length=20, choices=STATUS, default="pending")
    priority = models.IntegerField(default=0)
    assigned_to = models.CharField(
        max_length=128,
        blank=True,
        db_index=True,
        help_text="Optional annotator assignment (username, email, or worker ID)."
    )
    payload = models.JSONField(
        default=dict, blank=True, help_text="Per-task extra config."
    )
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        indexes = [
            models.Index(fields=["project", "status"], name="task_proj_status_idx"),
            models.Index(fields=["created_at"], name="task_created_at_idx"),
        ]


class Assignment(models.Model):
    """Represents an MTurk assignment for a given Task (or other future annotation backends)."""

    STATUS = [
        ("created", "created"),
        ("submitted", "submitted"),
        ("approved", "approved"),
        ("rejected", "rejected"),
        ("returned", "returned"),
        ("expired", "expired"),
    ]
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="assignments")
    backend = models.CharField(max_length=32, default="mturk")  # future-proof
    hit_id = models.CharField(max_length=128, blank=True)
    assignment_id = models.CharField(max_length=128, blank=True)
    worker_id = models.CharField(max_length=128, blank=True)
    status = models.CharField(max_length=20, choices=STATUS, default="created")
    sandbox = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(default=timezone.now)
    payload = models.JSONField(
        default=dict, blank=True, help_text="Raw MTurk payload snapshots."
    )
    last_polled_at = models.DateTimeField(null=True, blank=True)
    ingested_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["backend", "hit_id"], name="asgn_backend_hit_idx"),
            models.Index(fields=["assignment_id"], name="asgn_assignment_idx"),
            models.Index(fields=["task", "status"], name="asgn_task_status_idx"),
            models.Index(
                fields=["status", "updated_at"], name="asgn_status_updated_idx"
            ),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["backend", "assignment_id"],
                name="uniq_backend_assignment_id",
                condition=~models.Q(assignment_id=""),
            )
        ]

    def touch(self):
        self.updated_at = timezone.now()
        self.save(update_fields=["updated_at"])


class Annotation(models.Model):
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="annotations")
    result = models.JSONField()
    schema_version = models.CharField(max_length=32)
    tool_version = models.CharField(max_length=32, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    actor = models.CharField(
        max_length=128, blank=True, help_text="Optional session/worker identifier."
    )
    submission_id = models.CharField(
        max_length=128,
        blank=True,
        help_text="Idempotency key (e.g., MTurk assignment or client-provided UUID).",
    )
    assignment = models.ForeignKey(
        "Assignment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="annotations",
        help_text="Source assignment if known.",
    )
    raw_payload = models.JSONField(
        default=dict, blank=True, help_text="Raw submission payload for audit."
    )

    class Meta:
        indexes = [
            models.Index(fields=["task", "created_at"], name="anno_task_created_idx"),
            models.Index(fields=["submission_id"], name="anno_submission_idx"),
            models.Index(fields=["actor"], name="anno_actor_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["task", "submission_id"],
                name="uniq_task_submission_id",
                condition=~models.Q(submission_id=""),
            )
        ]


class FrontendPlugin(models.Model):
    """Maps a TaskType to a frontend bundle served by this backend."""

    task_type = models.OneToOneField(
        TaskType, on_delete=models.CASCADE, related_name="plugin"
    )
    name = models.CharField(max_length=200)
    version = models.CharField(max_length=32)
    manifest = models.JSONField(default=dict)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)


class EventLog(models.Model):
    event_type = models.CharField(max_length=64)
    ts = models.DateTimeField(default=timezone.now)
    actor = models.CharField(max_length=128, blank=True)
    payload = models.JSONField(default=dict, blank=True)


def log_event(event_type: str, actor: str = "", payload=None):
    """Create an audit-trail entry in EventLog."""
    EventLog.objects.create(
        event_type=event_type, actor=actor or "", payload=payload or {}
    )
