from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.decorators import method_decorator
from django_ratelimit.decorators import ratelimit
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .exports import ExportError, render_project_export
from .models import (
    Annotation,
    Asset,
    Assignment,
    FrontendPlugin,
    Project,
    Task,
    TaskDefinition,
    TaskType,
    log_event,
)
from .permissions import HasOperatorToken, HasWriteToken
from .serializers import (
    AnnotationSerializer,
    AssetSerializer,
    AssignmentSerializer,
    FrontendPluginSerializer,
    ProjectSerializer,
    TaskDefinitionSerializer,
    TaskSerializer,
    TaskTypeSerializer,
)


def _task_asset_url(asset: Asset):
    """Return the frontend-consumable task asset URL when delivery is configured."""
    if not getattr(settings, "S3_BUCKET", "").strip():
        return None

    try:
        return asset.presigned_url()
    except Exception:
        return None


class ProjectViewSet(viewsets.ModelViewSet):
    queryset = Project.objects.all().order_by("id")
    serializer_class = ProjectSerializer
    permission_classes = [HasWriteToken]

    @action(detail=True, methods=["get"], permission_classes=[AllowAny])
    def stats(self, request, pk=None):
        """Return annotation progress statistics for this project."""
        from django.db.models import Count, Q

        project = self.get_object()
        tasks = Task.objects.filter(project=project)

        task_stats = tasks.aggregate(
            total=Count('id'),
            pending=Count('id', filter=Q(status='pending')),
            in_progress=Count('id', filter=Q(status='in_progress')),
            complete=Count('id', filter=Q(status='complete')),
            failed=Count('id', filter=Q(status='failed')),
        )

        annotation_count = Annotation.objects.filter(task__project=project).count()
        unique_actors = Annotation.objects.filter(
            task__project=project
        ).exclude(actor='').values('actor').distinct().count()

        assignment_stats = Assignment.objects.filter(task__project=project).aggregate(
            total=Count('id'),
            created=Count('id', filter=Q(status='created')),
            submitted=Count('id', filter=Q(status='submitted')),
            approved=Count('id', filter=Q(status='approved')),
            rejected=Count('id', filter=Q(status='rejected')),
            returned=Count('id', filter=Q(status='returned')),
            expired=Count('id', filter=Q(status='expired')),
        )

        return Response({
            'project_id': project.id,
            'project_slug': project.slug,
            'tasks': task_stats,
            'annotations': {
                'total': annotation_count,
                'unique_actors': unique_actors,
            },
            'assignments': assignment_stats,
        })

    @action(detail=True, methods=["get"], permission_classes=[HasOperatorToken])
    def export(self, request, pk=None):
        """Export a private raw collection bundle for this project."""
        from django.http import HttpResponse

        project = self.get_object()
        format_type = request.query_params.get("export_format", "json")

        try:
            content, content_type, filename = render_project_export(project, format_type)
        except ExportError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        response = HttpResponse(content, content_type=content_type)
        response["Content-Disposition"] = f'attachment; filename="{filename}"'

        return response


class AssetViewSet(viewsets.ModelViewSet):
    queryset = Asset.objects.select_related("project").all().order_by("id")
    serializer_class = AssetSerializer
    permission_classes = [HasWriteToken]


class TaskTypeViewSet(viewsets.ModelViewSet):
    queryset = TaskType.objects.all().order_by("id")
    serializer_class = TaskTypeSerializer
    permission_classes = [HasWriteToken]


class TaskDefinitionViewSet(viewsets.ModelViewSet):
    queryset = TaskDefinition.objects.select_related("task_type").all().order_by("id")
    serializer_class = TaskDefinitionSerializer
    permission_classes = [HasWriteToken]


class TaskViewSet(viewsets.ModelViewSet):
    queryset = (
        Task.objects.select_related(
            "project", "asset", "task_definition", "task_definition__task_type"
        )
        .all()
        .order_by("id")
    )
    serializer_class = TaskSerializer
    permission_classes = [HasWriteToken]

    @action(detail=True, methods=["get"], permission_classes=[AllowAny])
    def bundle(self, request, pk=None):
        """Return everything the frontend needs in one call."""
        task: Task = self.get_object()
        td = task.task_definition
        tt = td.task_type
        plugin = getattr(tt, "plugin", None)
        plugin_manifest = plugin.manifest if plugin and plugin.is_active else None
        asset_data = AssetSerializer(task.asset).data
        return Response(
            {
                "task": TaskSerializer(task).data,
                "asset": asset_data,
                "asset_url": _task_asset_url(task.asset),
                "task_type": TaskTypeSerializer(tt).data,
                "task_definition": TaskDefinitionSerializer(td).data,
                "plugin": plugin_manifest,
            }
        )

    @action(detail=True, methods=["post"], permission_classes=[HasWriteToken])
    def duplicate(self, request, pk=None):
        """Create a duplicate task with a new asset."""
        source_task = self.get_object()
        asset_id = request.data.get('asset_id')

        if not asset_id:
            return Response(
                {'error': 'asset_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            new_asset = Asset.objects.get(id=asset_id)
        except Asset.DoesNotExist:
            return Response(
                {'error': f'Asset {asset_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        if new_asset.project_id != source_task.project_id:
            return Response(
                {
                    'error': 'asset_id must reference an asset in the same project as the '
                    'source task'
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # Create duplicate task
        new_task = Task.objects.create(
            project=source_task.project,
            asset=new_asset,
            task_definition=source_task.task_definition,
            status='pending',
            priority=source_task.priority,
            assigned_to=request.data.get('assigned_to', ''),
            payload=source_task.payload.copy() if source_task.payload else {},
        )

        return Response(
            TaskSerializer(new_task).data,
            status=status.HTTP_201_CREATED
        )


class AnnotationViewSet(viewsets.ModelViewSet):
    queryset = Annotation.objects.select_related("task").all().order_by("id")
    serializer_class = AnnotationSerializer
    permission_classes = [HasWriteToken]

    @method_decorator(ratelimit(key='ip', rate='100/h', method='POST'))
    def create(self, request, *args, **kwargs):
        self._duplicate_annotation = None
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        annotation = self.perform_create(serializer)
        duplicate = getattr(self, "_duplicate_annotation", None)
        instance = duplicate or annotation
        output = self.get_serializer(instance)
        status_code = status.HTTP_200_OK if duplicate else status.HTTP_201_CREATED
        headers = {}
        if not duplicate:
            headers = self.get_success_headers(output.data)
        return Response(output.data, status=status_code, headers=headers)

    def perform_create(self, serializer):
        data = serializer.validated_data
        submission_id = data.get("submission_id", "")
        task = data["task"]
        assignment = data.get("assignment")
        actor = data.get("actor", "")

        existing = self._find_existing_annotation(task, submission_id)
        if existing:
            self._duplicate_annotation = existing
            return existing

        if not assignment and submission_id:
            assignment = Assignment.objects.filter(
                backend="mturk", assignment_id=submission_id
            ).first()
            if assignment and assignment.task_id != task.id:
                raise serializers.ValidationError(
                    {
                        "submission_id": (
                            "Submission ID belongs to an assignment for a different task."
                        )
                    }
                )
            if assignment:
                data["assignment"] = assignment

        try:
            with transaction.atomic():
                existing = self._find_existing_annotation(task, submission_id, lock=True)
                if existing:
                    self._duplicate_annotation = existing
                    return existing

                obj = serializer.save()
                if assignment:
                    self._mark_assignment_submitted(assignment, obj)
        except IntegrityError:
            existing = self._find_existing_annotation(task, submission_id)
            if submission_id and existing:
                self._duplicate_annotation = existing
                return existing
            raise

        log_event(
            "ANNOTATION_CREATED",
            actor=actor,
            payload={
                "task_id": obj.task_id,
                "annotation_id": obj.id,
                "submission_id": obj.submission_id,
                "assignment_id": assignment.id if assignment else None,
            },
        )
        return obj

    def _find_existing_annotation(self, task, submission_id, lock=False):
        if not submission_id:
            return None

        queryset = Annotation.objects.filter(task=task, submission_id=submission_id)
        if lock:
            queryset = queryset.select_for_update()
        return queryset.first()

    def _mark_assignment_submitted(self, assignment, annotation):
        dirty = []
        if assignment.ingested_at is None:
            assignment.ingested_at = annotation.created_at
            dirty.append("ingested_at")
        if assignment.status != "submitted":
            assignment.status = "submitted"
            dirty.append("status")
        payload = assignment.payload or {}
        new_payload = dict(payload)
        new_payload["latest_annotation_submission"] = annotation.raw_payload
        if new_payload != payload:
            assignment.payload = new_payload
            dirty.append("payload")
        if dirty:
            assignment.updated_at = timezone.now()
            assignment.save(update_fields=dirty + ["updated_at"])


class AssignmentViewSet(viewsets.ModelViewSet):
    queryset = Assignment.objects.select_related("task").all().order_by("id")
    serializer_class = AssignmentSerializer
    permission_classes = [HasWriteToken]


class PluginViewSet(viewsets.ModelViewSet):
    queryset = FrontendPlugin.objects.select_related("task_type").all().order_by("id")
    serializer_class = FrontendPluginSerializer
    permission_classes = [HasWriteToken]
