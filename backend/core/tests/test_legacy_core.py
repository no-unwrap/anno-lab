"""Unit tests for core module functions and serializers."""

import json
import tempfile
from pathlib import Path
from unittest import mock

from django.core.exceptions import ValidationError as DjangoValidationError
from django.test import TestCase, override_settings

import core.plugin_validation as plugin_validation
from core.adapters.mturk.client import get_mturk_client
from core.adapters.mturk.templates import external_question_xml
from core.models import Asset, Assignment, Project, Task, TaskDefinition, TaskType
from core.mturk import _parse_mturk_answers
from core.plugin_validation import validate_plugin_manifest
from core.serializers import AnnotationSerializer


class GetMturkClientTestCase(TestCase):
    """Test get_mturk_client returns correct boto3 client for sandbox and production."""

    @override_settings(MTURK_SANDBOX=True, AWS_REGION="us-west-2")
    @mock.patch("core.adapters.mturk.client.boto3.client")
    def test_sandbox_environment(self, mock_boto_client):
        """Test client is configured for sandbox environment."""
        get_mturk_client()

        mock_boto_client.assert_called_once_with(
            "mturk",
            region_name="us-west-2",
            endpoint_url="https://mturk-requester-sandbox.us-east-1.amazonaws.com",
        )

    @override_settings(MTURK_SANDBOX=False, AWS_REGION="us-east-1")
    @mock.patch("core.adapters.mturk.client.boto3.client")
    def test_production_environment(self, mock_boto_client):
        """Test client is configured for production environment."""
        get_mturk_client()

        mock_boto_client.assert_called_once_with(
            "mturk",
            region_name="us-east-1",
            endpoint_url="https://mturk-requester.us-east-1.amazonaws.com",
        )

    @override_settings(MTURK_SANDBOX=True, AWS_REGION="eu-west-1")
    @mock.patch("core.adapters.mturk.client.boto3.client")
    def test_region_from_environment_variable(self, mock_boto_client):
        """Test AWS_REGION can be overridden through Django settings."""
        get_mturk_client()

        mock_boto_client.assert_called_once_with(
            "mturk",
            region_name="eu-west-1",
            endpoint_url="https://mturk-requester-sandbox.us-east-1.amazonaws.com",
        )

    @override_settings(
        MTURK_SANDBOX=False,
        MTURK_ENDPOINT="https://custom-endpoint.example.com",
    )
    @mock.patch("core.adapters.mturk.client.boto3.client")
    def test_endpoint_from_environment_variable(self, mock_boto_client):
        """Test MTURK_ENDPOINT can be overridden through Django settings."""
        get_mturk_client()

        call_kwargs = mock_boto_client.call_args[1]
        self.assertEqual(
            call_kwargs["endpoint_url"], "https://custom-endpoint.example.com"
        )


class ExternalQuestionXmlTestCase(TestCase):
    """Test external_question_xml generates valid XML with proper URL escaping."""

    def test_simple_url(self):
        """Test XML generation with a simple URL."""
        url = "https://example.com/task"
        result = external_question_xml(url)

        self.assertIn('<?xml version="1.0" encoding="UTF-8"?>', result)
        self.assertIn(
            '<ExternalQuestion xmlns="http://mechanicalturk.amazonaws.com', result
        )
        self.assertIn("<ExternalURL>https://example.com/task</ExternalURL>", result)
        self.assertIn("<FrameHeight>900</FrameHeight>", result)

    def test_url_with_query_parameters(self):
        """Test XML generation properly escapes URL with query parameters."""
        url = "https://example.com/task?id=123&type=annotation"
        result = external_question_xml(url)

        # Ampersands should be escaped
        self.assertIn("id=123&amp;type=annotation", result)
        self.assertNotIn("id=123&type=annotation", result)

    def test_url_with_special_characters(self):
        """Test XML generation escapes special characters properly."""
        url = 'https://example.com/task?data=<value>&flag="true"'
        result = external_question_xml(url)

        # Check for proper escaping
        self.assertIn("&lt;", result)  # < should be escaped
        self.assertIn("&quot;", result)  # " should be escaped
        self.assertIn("&amp;", result)  # & should be escaped
        # Original characters should not be present unescaped in the URL
        self.assertNotIn("<value>", result)

    def test_custom_frame_height(self):
        """Test XML generation with custom frame height."""
        url = "https://example.com/task"
        result = external_question_xml(url, frame_height=1200)

        self.assertIn("<FrameHeight>1200</FrameHeight>", result)

    def test_generated_xml_is_well_formed(self):
        """Test that generated XML can be parsed (is well-formed)."""
        import xml.etree.ElementTree as ET

        url = "https://example.com/task?param=value&other=test"
        result = external_question_xml(url)

        # Should not raise an exception
        tree = ET.fromstring(result)
        self.assertIsNotNone(tree)


class ParseMturkAnswersTestCase(TestCase):
    """Test _parse_mturk_answers correctly extracts annotation data and handles malformed XML."""

    def test_valid_xml_with_annotation(self):
        """Test parsing valid MTurk answer XML with annotation data."""
        annotation_data = {"labels": ["cat", "dog"], "boxes": [[10, 20, 30, 40]]}
        xml = f"""<?xml version="1.0" encoding="UTF-8"?>
        <QuestionFormAnswers xmlns="http://mechanicalturk.amazonaws.com/AWSMechanicalTurkDataSchemas/2005-10-01/QuestionFormAnswers.xsd">
          <Answer>
            <QuestionIdentifier>annotation</QuestionIdentifier>
            <FreeText>{json.dumps(annotation_data)}</FreeText>
          </Answer>
        </QuestionFormAnswers>"""

        result = _parse_mturk_answers(xml)

        self.assertIn("fields", result)
        self.assertIn("annotation", result["fields"])
        self.assertEqual(result["fields"]["annotation"], json.dumps(annotation_data))
        self.assertIn("annotation_json", result)
        self.assertEqual(result["annotation_json"], annotation_data)
        self.assertIn("raw", result)

    def test_valid_xml_multiple_fields(self):
        """Test parsing XML with multiple answer fields."""
        xml = """<?xml version="1.0" encoding="UTF-8"?>
        <QuestionFormAnswers xmlns="http://mechanicalturk.amazonaws.com/AWSMechanicalTurkDataSchemas/2005-10-01/QuestionFormAnswers.xsd">
          <Answer>
            <QuestionIdentifier>field1</QuestionIdentifier>
            <FreeText>value1</FreeText>
          </Answer>
          <Answer>
            <QuestionIdentifier>field2</QuestionIdentifier>
            <FreeText>value2</FreeText>
          </Answer>
        </QuestionFormAnswers>"""

        result = _parse_mturk_answers(xml)

        self.assertEqual(result["fields"]["field1"], "value1")
        self.assertEqual(result["fields"]["field2"], "value2")

    def test_malformed_xml(self):
        """Test handling of malformed XML."""
        malformed_xml = "<QuestionFormAnswers><Answer><Unclosed>"

        result = _parse_mturk_answers(malformed_xml)

        self.assertIn("fields", result)
        self.assertEqual(result["fields"], {})
        self.assertIn("raw", result)
        self.assertEqual(result["raw"], malformed_xml)

    def test_empty_xml(self):
        """Test handling of empty XML string."""
        result = _parse_mturk_answers("")

        self.assertEqual(result, {"fields": {}})

    def test_none_xml(self):
        """Test handling of None input."""
        result = _parse_mturk_answers(None)

        self.assertEqual(result, {"fields": {}})

    def test_xml_with_invalid_json_annotation(self):
        """Test handling of annotation field with invalid JSON."""
        xml = """<?xml version="1.0" encoding="UTF-8"?>
        <QuestionFormAnswers xmlns="http://mechanicalturk.amazonaws.com/AWSMechanicalTurkDataSchemas/2005-10-01/QuestionFormAnswers.xsd">
          <Answer>
            <QuestionIdentifier>annotation</QuestionIdentifier>
            <FreeText>not valid json{</FreeText>
          </Answer>
        </QuestionFormAnswers>"""

        result = _parse_mturk_answers(xml)

        self.assertIn("fields", result)
        self.assertEqual(result["fields"]["annotation"], "not valid json{")
        # annotation_json should not be present when JSON parsing fails
        self.assertNotIn("annotation_json", result)

    def test_xml_without_namespace(self):
        """Test parsing XML without namespace (after stripping)."""
        xml = """<?xml version="1.0" encoding="UTF-8"?>
        <QuestionFormAnswers>
          <Answer>
            <QuestionIdentifier>test</QuestionIdentifier>
            <FreeText>testvalue</FreeText>
          </Answer>
        </QuestionFormAnswers>"""

        result = _parse_mturk_answers(xml)

        self.assertEqual(result["fields"]["test"], "testvalue")

    def test_xml_with_empty_fields(self):
        """Test parsing XML with empty QuestionIdentifier or FreeText."""
        xml = """<?xml version="1.0" encoding="UTF-8"?>
        <QuestionFormAnswers>
          <Answer>
            <QuestionIdentifier></QuestionIdentifier>
            <FreeText>value</FreeText>
          </Answer>
          <Answer>
            <QuestionIdentifier>key</QuestionIdentifier>
            <FreeText></FreeText>
          </Answer>
        </QuestionFormAnswers>"""

        result = _parse_mturk_answers(xml)

        # Empty key should not be added
        self.assertNotIn("", result["fields"])
        # Key with empty value should be added
        self.assertIn("key", result["fields"])
        self.assertEqual(result["fields"]["key"], "")


class AnnotationSerializerTestCase(TestCase):
    """Test AnnotationSerializer handles submission idempotency and validates assignment-task relationship."""

    def setUp(self):
        """Set up test data."""
        self.project = Project.objects.create(slug="test-project", name="Test Project")
        self.asset = Asset.objects.create(
            project=self.project, media_type="image", s3_key="test/image.jpg"
        )
        self.task_type = TaskType.objects.create(slug="bbox", name="Bounding Box")
        self.task_definition = TaskDefinition.objects.create(
            task_type=self.task_type, version="1.0", definition={}
        )
        self.task = Task.objects.create(
            project=self.project, asset=self.asset, task_definition=self.task_definition
        )
        self.other_task = Task.objects.create(
            project=self.project, asset=self.asset, task_definition=self.task_definition
        )
        self.assignment = Assignment.objects.create(
            task=self.task,
            backend="mturk",
            hit_id="TEST_HIT_123",
            assignment_id="TEST_ASSIGNMENT_123",
        )

    def test_submission_id_auto_generated_if_missing(self):
        """Test submission_id is automatically generated if not provided."""
        data = {"task": self.task.id, "result": {"boxes": []}, "schema_version": "1.0"}
        serializer = AnnotationSerializer(data=data)

        self.assertTrue(serializer.is_valid())
        self.assertIsNotNone(serializer.validated_data["submission_id"])
        self.assertNotEqual(serializer.validated_data["submission_id"], "")

    def test_submission_id_preserved_if_provided(self):
        """Test submission_id is preserved when provided."""
        submission_id = "custom-submission-123"
        data = {
            "task": self.task.id,
            "result": {"boxes": []},
            "schema_version": "1.0",
            "submission_id": submission_id,
        }
        serializer = AnnotationSerializer(data=data)

        self.assertTrue(serializer.is_valid())
        self.assertEqual(serializer.validated_data["submission_id"], submission_id)

    def test_raw_payload_defaults_to_empty_dict(self):
        """Test raw_payload defaults to empty dict if not provided."""
        data = {"task": self.task.id, "result": {"boxes": []}, "schema_version": "1.0"}
        serializer = AnnotationSerializer(data=data)

        self.assertTrue(serializer.is_valid())
        self.assertEqual(serializer.validated_data["raw_payload"], {})

    def test_assignment_task_relationship_valid(self):
        """Test validation passes when assignment belongs to the task."""
        data = {
            "task": self.task.id,
            "result": {"boxes": []},
            "schema_version": "1.0",
            "assignment": self.assignment.id,
        }
        serializer = AnnotationSerializer(data=data)

        self.assertTrue(serializer.is_valid())

    def test_assignment_task_relationship_invalid(self):
        """Test validation fails when assignment does not belong to the task."""
        data = {
            "task": self.other_task.id,  # Different task
            "result": {"boxes": []},
            "schema_version": "1.0",
            "assignment": self.assignment.id,  # Assignment belongs to self.task
        }
        serializer = AnnotationSerializer(data=data)

        self.assertFalse(serializer.is_valid())
        self.assertIn("assignment", serializer.errors)
        self.assertIn("does not belong to task", str(serializer.errors["assignment"]))

    def test_assignment_none_is_valid(self):
        """Test validation passes when assignment is None."""
        data = {
            "task": self.task.id,
            "result": {"boxes": []},
            "schema_version": "1.0",
            "assignment": None,
        }
        serializer = AnnotationSerializer(data=data)

        self.assertTrue(serializer.is_valid())

    def test_assignment_not_provided(self):
        """Test validation passes when assignment is not provided."""
        data = {"task": self.task.id, "result": {"boxes": []}, "schema_version": "1.0"}
        serializer = AnnotationSerializer(data=data)

        self.assertTrue(serializer.is_valid())

    def test_create_annotation_with_all_fields(self):
        """Test creating annotation with all fields including assignment."""
        data = {
            "task": self.task.id,
            "result": {"boxes": [{"x": 10, "y": 20}]},
            "schema_version": "1.0",
            "tool_version": "2.0",
            "actor": "worker123",
            "submission_id": "sub-123",
            "assignment": self.assignment.id,
            "raw_payload": {"source": "mturk"},
        }
        serializer = AnnotationSerializer(data=data)

        self.assertTrue(serializer.is_valid())
        annotation = serializer.save()

        self.assertEqual(annotation.task.id, self.task.id)
        self.assertEqual(annotation.assignment.id, self.assignment.id)
        self.assertEqual(annotation.submission_id, "sub-123")
        self.assertEqual(annotation.raw_payload, {"source": "mturk"})


class ValidatePluginManifestTestCase(TestCase):
    """Test validate_plugin_manifest correctly validates plugin manifests."""

    def setUp(self):
        """Set up test environment with temporary directories."""
        self.temp_dir = tempfile.TemporaryDirectory()
        self.test_frontends_root = Path(self.temp_dir.name) / "frontends"
        self.test_plugin_root = self.test_frontends_root / "test-plugin"
        self.frontends_root_patch = mock.patch.object(
            plugin_validation,
            "FRONTENDS_ROOT",
            self.test_frontends_root.resolve(),
        )
        self.frontends_root_patch.start()

        # Create directories
        self.test_frontends_root.mkdir(parents=True, exist_ok=True)
        self.test_plugin_root.mkdir(parents=True, exist_ok=True)

        # Create test files
        self.test_js_file = self.test_plugin_root / "main.js"
        self.test_js_file.write_text("// test js")

        self.test_css_file = self.test_plugin_root / "styles.css"
        self.test_css_file.write_text("/* test css */")

    def tearDown(self):
        """Clean up test files."""
        self.frontends_root_patch.stop()
        self.temp_dir.cleanup()

    def test_valid_manifest(self):
        """Test validation of a complete valid manifest."""
        manifest = {
            "name": "Test Plugin",
            "task_type": "bbox",
            "version": "1.0.0",
            "root": "test-plugin",
            "js": ["main.js"],
            "css": ["styles.css"],
            "result_schema_version": "1.0",
        }

        result = validate_plugin_manifest(manifest)

        self.assertEqual(result["name"], "Test Plugin")
        self.assertEqual(result["task_type"], "bbox")
        self.assertEqual(result["version"], "1.0.0")
        self.assertEqual(result["root"], "test-plugin")
        self.assertEqual(result["js"], ["main.js"])
        self.assertEqual(result["css"], ["styles.css"])

    def test_missing_required_fields(self):
        """Test validation fails when required fields are missing."""
        manifest = {
            "name": "Test Plugin",
            "task_type": "bbox",
            # Missing: version, root, js, result_schema_version
        }

        with self.assertRaises(DjangoValidationError) as context:
            validate_plugin_manifest(manifest)

        error_message = str(context.exception)
        self.assertIn("missing required fields", error_message.lower())

    def test_not_a_dict(self):
        """Test validation fails when manifest is not a dict."""
        manifest = ["not", "a", "dict"]

        with self.assertRaises(DjangoValidationError) as context:
            validate_plugin_manifest(manifest)

        self.assertIn("must be a JSON object", str(context.exception))

    def test_root_is_absolute_path(self):
        """Test validation fails when root is an absolute path."""
        manifest = {
            "name": "Test Plugin",
            "task_type": "bbox",
            "version": "1.0.0",
            "root": "/absolute/path",
            "js": ["main.js"],
            "css": [],
            "result_schema_version": "1.0",
        }

        with self.assertRaises(DjangoValidationError) as context:
            validate_plugin_manifest(manifest)

        self.assertIn("must be a relative path", str(context.exception))

    def test_root_contains_parent_directory_traversal(self):
        """Test validation fails when root contains .. (path traversal)."""
        manifest = {
            "name": "Test Plugin",
            "task_type": "bbox",
            "version": "1.0.0",
            "root": "../escape",
            "js": ["main.js"],
            "css": [],
            "result_schema_version": "1.0",
        }

        with self.assertRaises(DjangoValidationError) as context:
            validate_plugin_manifest(manifest)

        self.assertIn("must be a relative path", str(context.exception))

    def test_root_does_not_exist(self):
        """Test validation fails when root directory does not exist."""
        manifest = {
            "name": "Test Plugin",
            "task_type": "bbox",
            "version": "1.0.0",
            "root": "nonexistent-plugin",
            "js": ["main.js"],
            "css": [],
            "result_schema_version": "1.0",
        }

        with self.assertRaises(DjangoValidationError) as context:
            validate_plugin_manifest(manifest)

        self.assertIn("does not exist", str(context.exception))

    def test_js_file_does_not_exist(self):
        """Test validation fails when JS file does not exist."""
        manifest = {
            "name": "Test Plugin",
            "task_type": "bbox",
            "version": "1.0.0",
            "root": "test-plugin",
            "js": ["nonexistent.js"],
            "css": [],
            "result_schema_version": "1.0",
        }

        with self.assertRaises(DjangoValidationError) as context:
            validate_plugin_manifest(manifest)

        self.assertIn("not found", str(context.exception))

    def test_asset_path_cannot_escape_to_sibling_directory(self):
        """Test validation rejects sibling-directory prefix escapes."""
        sibling_root = self.test_frontends_root / "test-plugin-extra"
        sibling_root.mkdir(parents=True, exist_ok=True)
        (sibling_root / "evil.js").write_text("// escaped asset")

        manifest = {
            "name": "Test Plugin",
            "task_type": "bbox",
            "version": "1.0.0",
            "root": "test-plugin",
            "js": ["../test-plugin-extra/evil.js"],
            "css": [],
            "result_schema_version": "1.0",
        }

        with self.assertRaises(DjangoValidationError) as context:
            validate_plugin_manifest(manifest)

        self.assertIn("escapes plugin root", str(context.exception))

    def test_css_file_does_not_exist(self):
        """Test validation fails when CSS file does not exist."""
        manifest = {
            "name": "Test Plugin",
            "task_type": "bbox",
            "version": "1.0.0",
            "root": "test-plugin",
            "js": ["main.js"],
            "css": ["nonexistent.css"],
            "result_schema_version": "1.0",
        }

        with self.assertRaises(DjangoValidationError) as context:
            validate_plugin_manifest(manifest)

        self.assertIn("not found", str(context.exception))

    def test_path_traversal_in_js_file(self):
        """Test validation fails when JS file path attempts directory traversal."""
        # Create a file outside the plugin root
        outside_file = self.test_frontends_root / "outside.js"
        outside_file.write_text("// outside")

        manifest = {
            "name": "Test Plugin",
            "task_type": "bbox",
            "version": "1.0.0",
            "root": "test-plugin",
            "js": ["../outside.js"],  # Tries to escape plugin root
            "css": [],
            "result_schema_version": "1.0",
        }

        with self.assertRaises(DjangoValidationError) as context:
            validate_plugin_manifest(manifest)

        self.assertIn("escapes plugin root", str(context.exception))

    def test_js_not_a_list(self):
        """Test validation fails when js field is not a list."""
        manifest = {
            "name": "Test Plugin",
            "task_type": "bbox",
            "version": "1.0.0",
            "root": "test-plugin",
            "js": "main.js",  # Should be a list
            "css": [],
            "result_schema_version": "1.0",
        }

        with self.assertRaises(DjangoValidationError) as context:
            validate_plugin_manifest(manifest)

        self.assertIn("must be a list", str(context.exception))

    def test_css_not_a_list(self):
        """Test validation fails when css field is not a list."""
        manifest = {
            "name": "Test Plugin",
            "task_type": "bbox",
            "version": "1.0.0",
            "root": "test-plugin",
            "js": ["main.js"],
            "css": "styles.css",  # Should be a list
            "result_schema_version": "1.0",
        }

        with self.assertRaises(DjangoValidationError) as context:
            validate_plugin_manifest(manifest)

        self.assertIn("must be a list", str(context.exception))

    def test_result_schema_version_invalid(self):
        """Test validation fails when result_schema_version is not a string."""
        manifest = {
            "name": "Test Plugin",
            "task_type": "bbox",
            "version": "1.0.0",
            "root": "test-plugin",
            "js": ["main.js"],
            "css": [],
            "result_schema_version": 1.0,  # Should be a string
        }

        with self.assertRaises(DjangoValidationError) as context:
            validate_plugin_manifest(manifest)

        self.assertIn("result_schema_version", str(context.exception))
        self.assertIn("must be a string", str(context.exception))

    def test_empty_asset_paths(self):
        """Test validation fails when asset paths are empty strings."""
        manifest = {
            "name": "Test Plugin",
            "task_type": "bbox",
            "version": "1.0.0",
            "root": "test-plugin",
            "js": [""],  # Empty path
            "css": [],
            "result_schema_version": "1.0",
        }

        with self.assertRaises(DjangoValidationError) as context:
            validate_plugin_manifest(manifest)

        self.assertIn("cannot be empty", str(context.exception))

    def test_manifest_with_extra_fields(self):
        """Test validation preserves extra fields not in required set."""
        manifest = {
            "name": "Test Plugin",
            "task_type": "bbox",
            "version": "1.0.0",
            "root": "test-plugin",
            "js": ["main.js"],
            "css": [],
            "result_schema_version": "1.0",
            "extra_field": "extra_value",
            "another_field": 123,
        }

        result = validate_plugin_manifest(manifest)

        self.assertEqual(result["extra_field"], "extra_value")
        self.assertEqual(result["another_field"], 123)

    def test_empty_js_and_css_lists(self):
        """Test validation allows empty js and css lists."""
        manifest = {
            "name": "Test Plugin",
            "task_type": "bbox",
            "version": "1.0.0",
            "root": "test-plugin",
            "js": [],
            "css": [],
            "result_schema_version": "1.0",
        }

        result = validate_plugin_manifest(manifest)

        self.assertEqual(result["js"], [])
        self.assertEqual(result["css"], [])
