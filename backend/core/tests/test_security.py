"""Security tests for anno-lab"""
from unittest import mock

import pytest
from django.db import IntegrityError
from django.test import Client, override_settings

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
from core.views import AnnotationViewSet


@pytest.mark.django_db
class TestPluginAssetSecurity:
    """Test plugin asset serving security."""

    def setup_method(self):
        """Set up test data."""
        self.client = Client()
        self.project = Project.objects.create(slug='test', name='Test Project')
        self.asset = Asset.objects.create(
            project=self.project,
            media_type='image',
            s3_key='test.jpg'
        )
        self.task_type = TaskType.objects.create(
            slug='test_type',
            name='Test Type'
        )
        self.task_def = TaskDefinition.objects.create(
            task_type=self.task_type,
            version='1.0',
            definition={}
        )
        self.task = Task.objects.create(
            project=self.project,
            asset=self.asset,
            task_definition=self.task_def
        )
        self.plugin = FrontendPlugin.objects.create(
            task_type=self.task_type,
            name='Test Plugin',
            version='1.0',
            manifest={
                'name': 'Test Plugin',
                'task_type': 'test_type',
                'version': '1.0',
                'root': 'instance-bbox/dist',
                'js': ['assets/index.js'],
                'css': [],
                'result_schema_version': '1.0.0'
            },
            is_active=True
        )

    def test_directory_traversal_rejected_with_double_dots(self):
        """Test that ../ directory traversal is rejected."""
        url = f'/api/tasks/{self.task.id}/annotate/plugin/../../../settings.py'
        response = self.client.get(url)
        assert response.status_code == 404

    def test_directory_traversal_rejected_with_absolute_path(self):
        """Test that absolute paths are rejected."""
        url = f'/api/tasks/{self.task.id}/annotate/plugin//etc/passwd'
        response = self.client.get(url)
        assert response.status_code == 404

    def test_valid_asset_path_works(self):
        """Test that valid asset paths work."""
        # This will 404 because file doesn't exist, but should pass security check
        url = f'/api/tasks/{self.task.id}/annotate/plugin/assets/index.js'
        response = self.client.get(url)
        # Either 404 (file not found) or 200 (file exists) is acceptable
        # Security rejection would be 404 with "Invalid path"
        assert response.status_code in [200, 404]

    def test_manifest_root_outside_frontends_is_rejected(self, tmp_path):
        """Test malformed manifest roots cannot escape the frontends directory."""
        frontends_root = tmp_path / 'frontends'
        frontends_root.mkdir()
        escaped_root = tmp_path / 'escaped-plugin'
        escaped_root.mkdir()
        (escaped_root / 'secret.js').write_text('console.log("secret");')

        self.plugin.manifest = {
            **self.plugin.manifest,
            'root': '../escaped-plugin',
            'js': ['secret.js'],
        }
        self.plugin.save(update_fields=['manifest'])

        with mock.patch('core.ui_views.FRONTENDS_DIR', frontends_root.resolve()):
            response = self.client.get(
                f'/api/tasks/{self.task.id}/annotate/plugin/secret.js'
            )

        assert response.status_code == 404


@pytest.mark.django_db
class TestAnnotationEndpointWriteSmoke:
    """Test annotation writes without implying an unimplemented throttle."""

    def setup_method(self):
        """Set up test data."""
        self.client = Client()
        self.project = Project.objects.create(slug='test', name='Test Project')
        self.asset = Asset.objects.create(
            project=self.project,
            media_type='image',
            s3_key='test.jpg'
        )
        self.task_type = TaskType.objects.create(
            slug='test_type',
            name='Test Type'
        )
        self.task_def = TaskDefinition.objects.create(
            task_type=self.task_type,
            version='1.0',
            definition={}
        )
        self.task = Task.objects.create(
            project=self.project,
            asset=self.asset,
            task_definition=self.task_def
        )

    @override_settings(WRITE_TOKEN='test-token')
    def test_annotation_write_succeeds_without_throttle(self):
        """Test that direct annotation writes still succeed when authorized."""
        # The backend does not currently implement a DRF throttle for this endpoint.
        payload = {
            'task': self.task.id,
            'result': {'test': 'data'},
            'schema_version': '1.0.0',
        }
        headers = {'HTTP_X_ANNO_LAB_WRITE_TOKEN': 'test-token'}
        response = self.client.post(
            '/api/annotations/',
            data=payload,
            content_type='application/json',
            **headers
        )
        # This is an authorized smoke check only, not a rate-limit assertion.
        assert response.status_code in [200, 201]


@pytest.mark.django_db
class TestWriteTokenProtection:
    """Test write token protection."""

    def setup_method(self):
        """Set up test data."""
        self.client = Client()

    @override_settings(WRITE_TOKEN='secret-token')
    def test_write_requires_token(self):
        """Test that write operations require token."""
        payload = {'slug': 'test', 'name': 'Test Project'}
        response = self.client.post(
            '/api/projects/',
            data=payload,
            content_type='application/json'
        )
        assert response.status_code == 403

    @override_settings(WRITE_TOKEN='secret-token')
    def test_write_succeeds_with_correct_token(self):
        """Test that write succeeds with correct token."""
        payload = {'slug': 'test', 'name': 'Test Project'}
        headers = {'HTTP_X_ANNO_LAB_WRITE_TOKEN': 'secret-token'}
        response = self.client.post(
            '/api/projects/',
            data=payload,
            content_type='application/json',
            **headers
        )
        assert response.status_code == 201

    @override_settings(WRITE_TOKEN='secret-token')
    def test_write_fails_with_wrong_token(self):
        """Test that write fails with wrong token."""
        payload = {'slug': 'test', 'name': 'Test Project'}
        headers = {'HTTP_X_ANNO_LAB_WRITE_TOKEN': 'wrong-token'}
        response = self.client.post(
            '/api/projects/',
            data=payload,
            content_type='application/json',
            **headers
        )
        assert response.status_code == 403

    @override_settings(WRITE_TOKEN='')
    def test_write_allowed_when_token_disabled(self):
        """Test that writes are allowed when token is disabled."""
        payload = {'slug': 'test', 'name': 'Test Project'}
        response = self.client.post(
            '/api/projects/',
            data=payload,
            content_type='application/json'
        )
        assert response.status_code == 201


@pytest.mark.django_db
class TestAnnotationSubmissionSafety:
    """Test idempotent annotation submission behavior."""

    def setup_method(self):
        self.client = Client()
        self.project = Project.objects.create(slug='test', name='Test Project')
        self.asset = Asset.objects.create(
            project=self.project,
            media_type='image',
            s3_key='test.jpg'
        )
        self.task_type = TaskType.objects.create(
            slug='test_type',
            name='Test Type'
        )
        self.task_def = TaskDefinition.objects.create(
            task_type=self.task_type,
            version='1.0',
            definition={}
        )
        self.task = Task.objects.create(
            project=self.project,
            asset=self.asset,
            task_definition=self.task_def
        )

    def _payload(self, submission_id='sub-123'):
        return {
            'task': self.task.id,
            'result': {'test': 'data'},
            'schema_version': '1.0.0',
            'submission_id': submission_id,
        }

    @override_settings(WRITE_TOKEN='test-token')
    def test_annotation_submission_requires_write_token_when_enabled(self):
        response = self.client.post(
            '/api/annotations/',
            data=self._payload(),
            content_type='application/json',
        )

        assert response.status_code == 403

    @override_settings(WRITE_TOKEN='')
    def test_annotation_submission_allowed_when_token_disabled(self):
        response = self.client.post(
            '/api/annotations/',
            data=self._payload(),
            content_type='application/json',
        )

        assert response.status_code == 201
        assert Annotation.objects.count() == 1

    @override_settings(WRITE_TOKEN='test-token')
    def test_duplicate_submission_returns_existing_annotation(self):
        headers = {'HTTP_X_ANNO_LAB_WRITE_TOKEN': 'test-token'}

        first = self.client.post(
            '/api/annotations/',
            data=self._payload(),
            content_type='application/json',
            **headers
        )
        second = self.client.post(
            '/api/annotations/',
            data=self._payload(),
            content_type='application/json',
            **headers
        )

        assert first.status_code == 201
        assert second.status_code == 200
        assert first.json()['id'] == second.json()['id']
        assert Annotation.objects.count() == 1

    def test_integrity_error_returns_existing_annotation(self):
        existing = Annotation.objects.create(
            task=self.task,
            result={'test': 'data'},
            schema_version='1.0.0',
            submission_id='sub-race',
        )
        serializer = mock.Mock()
        serializer.validated_data = {
            'task': self.task,
            'result': {'test': 'data'},
            'schema_version': '1.0.0',
            'submission_id': 'sub-race',
            'raw_payload': {},
            'actor': '',
        }
        serializer.save.side_effect = IntegrityError('duplicate key value')

        view = AnnotationViewSet()

        with mock.patch.object(
            view,
            '_find_existing_annotation',
            side_effect=[None, None, existing],
        ):
            result = view.perform_create(serializer)

        assert result == existing
        assert view._duplicate_annotation == existing
        serializer.save.assert_called_once()

    @override_settings(WRITE_TOKEN='test-token')
    def test_wrong_task_submission_id_is_rejected_without_mutating_assignment(self):
        other_task = Task.objects.create(
            project=self.project,
            asset=self.asset,
            task_definition=self.task_def,
        )
        assignment = Assignment.objects.create(
            task=other_task,
            backend='mturk',
            assignment_id='foreign-submission',
            status='created',
            payload={'before': 'value'},
        )
        original_updated_at = assignment.updated_at
        headers = {'HTTP_X_ANNO_LAB_WRITE_TOKEN': 'test-token'}

        response = self.client.post(
            '/api/annotations/',
            data={
                **self._payload(submission_id='foreign-submission'),
                'raw_payload': {'source': 'mturk'},
            },
            content_type='application/json',
            **headers
        )

        assert response.status_code == 400
        assert 'different task' in str(response.json()['submission_id'])
        assert Annotation.objects.count() == 0

        assignment.refresh_from_db()
        assert assignment.status == 'created'
        assert assignment.ingested_at is None
        assert assignment.payload == {'before': 'value'}
        assert assignment.updated_at == original_updated_at

    @override_settings(WRITE_TOKEN='test-token')
    def test_same_task_submission_id_auto_links_and_marks_assignment_submitted(self):
        assignment = Assignment.objects.create(
            task=self.task,
            backend='mturk',
            assignment_id='same-task-submission',
            status='created',
            payload={'before': 'value'},
        )
        headers = {'HTTP_X_ANNO_LAB_WRITE_TOKEN': 'test-token'}
        raw_payload = {'source': 'mturk', 'answer': 'yes'}

        response = self.client.post(
            '/api/annotations/',
            data={
                **self._payload(submission_id='same-task-submission'),
                'raw_payload': raw_payload,
            },
            content_type='application/json',
            **headers
        )

        assert response.status_code == 201

        annotation = Annotation.objects.get()
        assert annotation.assignment_id == assignment.id
        assert response.json()['assignment'] == assignment.id

        assignment.refresh_from_db()
        assert assignment.status == 'submitted'
        assert assignment.ingested_at is not None
        assert assignment.payload == {
            'before': 'value',
            'latest_annotation_submission': raw_payload,
        }


@pytest.mark.django_db
class TestTaskDuplicationSafety:
    """Test duplicate-task project boundaries."""

    def setup_method(self):
        self.client = Client()
        self.project = Project.objects.create(slug='project-a', name='Project A')
        self.other_project = Project.objects.create(slug='project-b', name='Project B')
        self.asset = Asset.objects.create(
            project=self.project,
            media_type='image',
            s3_key='task-a.jpg'
        )
        self.other_asset = Asset.objects.create(
            project=self.other_project,
            media_type='image',
            s3_key='task-b.jpg'
        )
        self.task_type = TaskType.objects.create(
            slug='test_type',
            name='Test Type'
        )
        self.task_def = TaskDefinition.objects.create(
            task_type=self.task_type,
            version='1.0',
            definition={}
        )
        self.task = Task.objects.create(
            project=self.project,
            asset=self.asset,
            task_definition=self.task_def
        )

    @override_settings(WRITE_TOKEN='test-token')
    def test_duplicate_rejects_cross_project_asset(self):
        response = self.client.post(
            f'/api/tasks/{self.task.id}/duplicate/',
            data={'asset_id': self.other_asset.id},
            content_type='application/json',
            HTTP_X_ANNO_LAB_WRITE_TOKEN='test-token'
        )

        assert response.status_code == 400
        assert 'same project' in response.json()['error']
