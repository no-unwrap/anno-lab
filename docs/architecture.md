# anno-lab System Architecture

## Table of Contents

1. [System Overview](#system-overview)
2. [Data Model Architecture](#data-model-architecture)
3. [API Endpoints](#api-endpoints)
4. [Plugin System](#plugin-system)
5. [MTurk Integration](#mturk-integration)
6. [Security Model](#security-model)
7. [Deployment Architecture](#deployment-architecture)

---

## System Overview

anno-lab is a Django REST Framework-based backend system for managing human annotation tasks at scale. It provides:

- **Multi-task type support** with versioned task definitions and schema validation
- **Human-in-the-loop annotation pipeline** with support for MTurk and future crowdsourcing backends
- **Pluggable frontend UIs** served from a centralized backend with manifest-driven loading
- **Scalable job processing** via Celery for asynchronous task creation and polling
- **Comprehensive audit trails** through event logging and annotation tracking
- **S3 asset integration** with presigned URL generation for media delivery

### Core Principles

1. **Separation of Concerns**: Task definitions, assets, annotations, and assignments are logically separated
2. **Extensibility**: Plugin system allows multiple annotation UI implementations per task type
3. **Auditability**: All critical operations are logged via EventLog
4. **Idempotency**: Annotation ingestion uses submission_id to prevent duplicates
5. **Rate Limiting**: POST endpoints (especially annotations) are rate-limited to prevent abuse

---

## Data Model Architecture

The system uses 9 core models organized into three layers: **Configuration**, **Execution**, and **Output**.

### Configuration Layer

#### Project
Represents a top-level annotation campaign or research project.

```python
class Project(models.Model):
    slug = models.SlugField(unique=True)           # URL-friendly identifier
    name = models.CharField(max_length=200)        # Display name
    description = models.TextField(blank=True)     # Project details
    created_at = models.DateTimeField(auto_now_add=True)
```

**Relationships**: One-to-Many with Asset (on_delete=CASCADE), Task (on_delete=CASCADE)

#### TaskType
Defines a category of annotation task (e.g., `instance_bbox`, `salient_poly`, `classification`).

```python
class TaskType(models.Model):
    slug = models.SlugField(unique=True)           # Unique identifier
    name = models.CharField(max_length=200)        # Display name
    description = models.TextField(blank=True)     # Purpose and usage
```

**Relationships**: One-to-Many with TaskDefinition (on_delete=CASCADE), One-to-One with FrontendPlugin (on_delete=CASCADE)

#### TaskDefinition
Versioned schema/configuration for a TaskType. Allows rolling out schema changes without breaking existing tasks.

```python
class TaskDefinition(models.Model):
    task_type = models.ForeignKey(TaskType, on_delete=models.CASCADE, related_name="definitions")
    version = models.CharField(max_length=32)  # e.g., "1.0", "1.1-alpha"
    definition = models.JSONField()            # Contains label schema, UI config, validation rules
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("task_type", "version")]
```

**Example definition field**:
```json
{
  "ui_config": {
    "show_instructions": true,
    "tool_options": ["rectangle", "polygon"]
  },
  "label_schema": {
    "type": "object",
    "properties": {
      "objects": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "category": {"type": "string"},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1}
          }
        }
      }
    }
  },
  "validation_rules": []
}
```

#### Asset
Media files (images, video frames) stored in S3.

```python
class Asset(models.Model):
    MEDIA_CHOICES = [("image", "image"), ("video_frame", "video_frame")]
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="assets")
    media_type = models.CharField(max_length=20, choices=MEDIA_CHOICES, default="image")
    s3_key = models.CharField(max_length=512)      # S3 object key (not URL)
    sha256 = models.CharField(max_length=64, blank=True)  # Content hash for verification
    width = models.IntegerField(null=True, blank=True)    # Image dimensions
    height = models.IntegerField(null=True, blank=True)
    metadata = models.JSONField(default=dict)      # Custom metadata (source URL, license, etc.)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["project", "media_type"])]
```

**Key Method**:
- `presigned_url(expiration=3600)`: Generates time-limited S3 URLs for client access via boto3

### Execution Layer

#### Task
Represents a single annotation work item.

```python
class Task(models.Model):
    STATUS = ["pending", "in_progress", "complete", "failed"]

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="tasks")
    asset = models.ForeignKey(Asset, on_delete=models.CASCADE, related_name="tasks")
    task_definition = models.ForeignKey(TaskDefinition, on_delete=models.PROTECT)
    status = models.CharField(max_length=20, choices=STATUS, default="pending")
    priority = models.IntegerField(default=0)
    assigned_to = models.CharField(max_length=128, blank=True)  # Optional worker/user assignment
    payload = models.JSONField(default=dict)       # Per-task configuration overrides
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["project", "status"]),
            models.Index(fields=["created_at"])
        ]
```

**Status Lifecycle**: `pending` → `in_progress` (optional) → `complete` or `failed`

**Relationships**:
- ForeignKey to Project, Asset, TaskDefinition
- One-to-Many with Annotation (on_delete=CASCADE)
- One-to-Many with Assignment (on_delete=CASCADE)

**Pre-annotation convention**:
- `Task.payload` is also the optional pre-annotation seed surface for
  external model pipelines
- the current contract lives under `payload.pre_annotations`
- shape:

```json
{
  "pre_annotations": {
    "schema_version": "1.0.0",
    "predictions": [
      {
        "id": "prediction-1",
        "kind": "bbox",
        "label": "person",
        "bbox": { "x": 80, "y": 120, "width": 240, "height": 320 }
      }
    ]
  }
}
```

- `kind` is task-type-agnostic: `bbox`, `polygon`, and `keypoints`
- plugins should consume only the kinds they understand and ignore the rest
- ML inference stays outside the Django runtime; the backend transports the
  payload but does not prescribe the model

#### Assignment
Represents a crowdsourcing work unit (MTurk HIT/Assignment pairing).

```python
class Assignment(models.Model):
    STATUS = [
        "created",      # HIT created, awaiting worker acceptance
        "submitted",    # Worker submitted work
        "approved",     # Requester approved
        "rejected",     # Requester rejected
        "returned",     # Worker returned early
        "expired"       # HIT lifetime expired
    ]

    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="assignments")
    backend = models.CharField(max_length=32, default="mturk")  # Future extensibility
    hit_id = models.CharField(max_length=128, blank=True)       # MTurk HIT ID
    assignment_id = models.CharField(max_length=128, blank=True) # MTurk Assignment ID
    worker_id = models.CharField(max_length=128, blank=True)    # MTurk Worker ID
    status = models.CharField(max_length=20, choices=STATUS, default="created")
    sandbox = models.BooleanField(default=True)                 # Sandbox vs Production
    payload = models.JSONField(default=dict)       # Raw MTurk snapshots and metadata
    last_polled_at = models.DateTimeField(null=True, blank=True)
    ingested_at = models.DateTimeField(null=True, blank=True)  # When annotation was created from this
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["backend", "hit_id"]),
            models.Index(fields=["assignment_id"]),
            models.Index(fields=["task", "status"]),
            models.Index(fields=["status", "updated_at"])
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["backend", "assignment_id"],
                name="uniq_backend_assignment_id",
                condition=~models.Q(assignment_id="")
            )
        ]
```

**Key Methods**:
- `touch()`: Updates `updated_at` timestamp for polling sort ordering

### Output Layer

#### Annotation
A submitted annotation result from a worker.

```python
class Annotation(models.Model):
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="annotations")
    result = models.JSONField()                     # The actual annotation data
    schema_version = models.CharField(max_length=32) # TaskDefinition version used
    tool_version = models.CharField(max_length=32, blank=True) # Frontend tool version
    created_at = models.DateTimeField(auto_now_add=True)
    actor = models.CharField(max_length=128, blank=True)       # Worker/user identifier
    submission_id = models.CharField(max_length=128, blank=True) # Idempotency key
    assignment = models.ForeignKey(Assignment, on_delete=models.SET_NULL, null=True, blank=True)
    raw_payload = models.JSONField(default=dict)   # Full submission details for audit

    class Meta:
        indexes = [
            models.Index(fields=["task", "created_at"]),
            models.Index(fields=["submission_id"]),
            models.Index(fields=["actor"])
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["task", "submission_id"],
                name="uniq_task_submission_id",
                condition=~models.Q(submission_id="")
            )
        ]
```

**Idempotency**: A `submission_id` (e.g., MTurk assignment_id or client UUID) ensures the same annotation is never ingested twice. If a duplicate is received, the existing record is returned with HTTP 200.

### Plugin Layer

#### FrontendPlugin
Maps a TaskType to a frontend bundle (JavaScript/CSS assets).

```python
class FrontendPlugin(models.Model):
    task_type = models.OneToOneField(TaskType, on_delete=models.CASCADE, related_name="plugin")
    name = models.CharField(max_length=200)        # Display name
    version = models.CharField(max_length=32)      # Plugin version
    manifest = models.JSONField(default=dict)      # Validated manifest with asset paths
    is_active = models.BooleanField(default=True)  # Feature flag for activation/deactivation
    created_at = models.DateTimeField(auto_now_add=True)
```

**Manifest Structure** (validated by `validate_plugin_manifest()`):
```json
{
  "name": "Salient Polygon Annotator",
  "task_type": "salient_poly",
  "version": "1.0.0",
  "root": "salient-poly/dist",
  "js": ["assets/index.js"],
  "css": ["assets/index.css"],
  "result_schema_version": "1.0.0",
  "custom_field": "optional data"
}
```

### Audit Layer

#### EventLog
Immutable record of all system events for audit trails.

```python
class EventLog(models.Model):
    event_type = models.CharField(max_length=64)   # e.g., "MTURK_HIT_CREATED", "ANNOTATION_CREATED"
    ts = models.DateTimeField(default=timezone.now)
    actor = models.CharField(max_length=128, blank=True) # User/system identifier
    payload = models.JSONField(default=dict)       # Event-specific data
```

**Common Events**:
- `MTURK_HIT_CREATED`: { task_id, hit_id, reward, max_assignments, lifetime_seconds }
- `MTURK_ASSIGNMENT_SYNCED`: { assignment_id, task_id, status }
- `MTURK_ASSIGNMENT_INGESTED`: { assignment_id, annotation_id, task_id }
- `ANNOTATION_CREATED`: { task_id, annotation_id, submission_id, assignment_id }

### Model Relationships Diagram

```
Project (root)
  ├─ Asset (1-to-many)
  │   └─ Task (1-to-many, through Asset)
  │       ├─ TaskDefinition (1-to-one via task_definition)
  │       │   ├─ TaskType (1-to-one via task_type)
  │       │   │   └─ FrontendPlugin (1-to-one)
  │       │   │       └─ manifest (validated JSON)
  │       ├─ Assignment (1-to-many)
  │       │   └─ payload (stores MTurk snapshots)
  │       └─ Annotation (1-to-many)
  │           ├─ assignment FK (optional)
  │           └─ result (annotation data)
  └─ EventLog (audit trail, unrelated)
```

---

## API Endpoints

All endpoints follow RESTful conventions via Django REST Framework's DefaultRouter. Base path: `/api/`

### Authentication & Authorization

All write operations (POST, PUT, PATCH, DELETE) require the `X-Anno-Lab-Write-Token` header (see [Security Model](#security-model)). Read operations (GET) are always public.

### ViewSets & Routes

#### ProjectViewSet
**Routes**: `/api/projects/`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/projects/` | List projects | Public |
| POST | `/api/projects/` | Create project | WRITE_TOKEN |
| GET | `/api/projects/{id}/` | Retrieve project | Public |
| PUT | `/api/projects/{id}/` | Update project | WRITE_TOKEN |
| DELETE | `/api/projects/{id}/` | Delete project | WRITE_TOKEN |
| GET | `/api/projects/{id}/stats/` | Annotation progress stats | Public |
| GET | `/api/projects/{id}/export/` | Export private raw collection bundle (JSON) | WRITE_TOKEN |

**Stats Response**:
```json
{
  "project_id": 1,
  "project_slug": "my-project",
  "tasks": {
    "total": 100,
    "pending": 50,
    "in_progress": 20,
    "complete": 25,
    "failed": 5
  },
  "annotations": {
    "total": 35,
    "unique_actors": 5
  },
  "assignments": {
    "total": 25,
    "created": 0,
    "submitted": 5,
    "approved": 15,
    "rejected": 2,
    "returned": 1,
    "expired": 2
  }
}
```

**Export Parameters**:
- `export_format` (query): `json` (default: json)

**Export Surface Note**:
- `/api/projects/{id}/export/` is the canonical anno-lab raw-export surface
- export access is operator-only because the bundle can contain raw MTurk
  worker identifiers, HIT/assignment metadata, answer payloads, and linked
  annotation provenance
- export snapshots are versioned outputs of the annotation runtime
- consumers should read exported files rather than anno-lab database tables directly
- the JSON bundle preserves project, task-type, task-definition, asset, task,
  assignment, and annotation records so downstream adapters such as
  `label-lab` can do cleaning, normalization, and publishing outside anno-lab

#### AssetViewSet
**Routes**: `/api/assets/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/assets/` | List assets |
| POST | `/api/assets/` | Create asset |
| GET | `/api/assets/{id}/` | Retrieve asset |
| PUT | `/api/assets/{id}/` | Update asset |
| DELETE | `/api/assets/{id}/` | Delete asset |

**Note**: Assets are created with s3_key references. Presigned URLs are generated on-demand via the model method, not stored in the database.

#### TaskTypeViewSet
**Routes**: `/api/task-types/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/task-types/` | List task types |
| POST | `/api/task-types/` | Create task type |
| GET | `/api/task-types/{id}/` | Retrieve task type |
| PUT | `/api/task-types/{id}/` | Update task type |
| DELETE | `/api/task-types/{id}/` | Delete task type |

#### TaskDefinitionViewSet
**Routes**: `/api/task-definitions/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/task-definitions/` | List definitions |
| POST | `/api/task-definitions/` | Create versioned definition |
| GET | `/api/task-definitions/{id}/` | Retrieve definition |
| PUT | `/api/task-definitions/{id}/` | Update definition |
| DELETE | `/api/task-definitions/{id}/` | Delete definition |

**Key Field**: `definition` (JSONField) containing UI config, label schema, validation rules

#### TaskViewSet
**Routes**: `/api/tasks/`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/tasks/` | List tasks | Public |
| POST | `/api/tasks/` | Create task | WRITE_TOKEN |
| GET | `/api/tasks/{id}/` | Retrieve task | Public |
| PUT | `/api/tasks/{id}/` | Update task | WRITE_TOKEN |
| DELETE | `/api/tasks/{id}/` | Delete task | WRITE_TOKEN |
| GET | `/api/tasks/{id}/bundle/` | Fetch all data for frontend | Public |
| POST | `/api/tasks/{id}/duplicate/` | Duplicate task with new asset | WRITE_TOKEN |

**Bundle Response** (optimized for frontend):
```json
{
  "task": { /* Task serialized */ },
  "asset": { /* Asset serialized with s3_key */ },
  "task_type": { /* TaskType serialized */ },
  "task_definition": { /* TaskDefinition with full definition JSON */ },
  "plugin": { /* FrontendPlugin.manifest (validated) or null */ }
}
```

**Duplicate Endpoint**:
```
POST /api/tasks/{id}/duplicate/
{
  "asset_id": 42,
  "assigned_to": "optional-worker-id"
}
```
Returns a new Task with the same definition but different asset.

#### AnnotationViewSet
**Routes**: `/api/annotations/`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/annotations/` | List annotations | Public |
| POST | `/api/annotations/` | Submit annotation | WRITE_TOKEN + Rate Limited (100/hr by IP) |
| GET | `/api/annotations/{id}/` | Retrieve annotation | Public |
| PUT | `/api/annotations/{id}/` | Update annotation | WRITE_TOKEN |
| DELETE | `/api/annotations/{id}/` | Delete annotation | WRITE_TOKEN |

**Create Request**:
```json
{
  "task": 1,
  "result": { /* annotation payload */ },
  "schema_version": "1.0",
  "tool_version": "2.1",
  "actor": "worker-123",
  "submission_id": "mtturk-assignment-abc",
  "assignment": 5,
  "raw_payload": { /* full submission details */ }
}
```

**Idempotency Behavior**:
- If `submission_id` matches an existing Annotation for the same task, returns the existing record with HTTP 200 (not 201)
- If `assignment` is provided, updates its status and payload
- Auto-generates `submission_id` if not provided (UUID hex)

#### AssignmentViewSet
**Routes**: `/api/assignments/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/assignments/` | List assignments |
| POST | `/api/assignments/` | Create assignment (rarely used directly) |
| GET | `/api/assignments/{id}/` | Retrieve assignment |
| PUT | `/api/assignments/{id}/` | Update assignment |
| DELETE | `/api/assignments/{id}/` | Delete assignment |

**Note**: Assignments are typically created via Celery tasks (`create_hit_for_task`), not directly.

#### PluginViewSet
**Routes**: `/api/plugins/`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/plugins/` | List plugins | Public |
| POST | `/api/plugins/` | Register/upload plugin | WRITE_TOKEN |
| GET | `/api/plugins/{id}/` | Retrieve plugin | Public |
| PUT | `/api/plugins/{id}/` | Update plugin | WRITE_TOKEN |
| DELETE | `/api/plugins/{id}/` | Delete plugin | WRITE_TOKEN |

**Manifest Validation**: Occurs automatically in serializer.validate(); invalid manifests are rejected with 400 Bad Request.

### UI Endpoints (Non-API)

#### Task Annotation UI
**Routes**: `/api/tasks/{task_id}/annotate/`

- `GET /api/tasks/{task_id}/annotate/mturk/?sandbox=0|1` - Renders the MTurk iframe with the active plugin
- `GET /api/tasks/{task_id}/annotate/...other-backends/` - Extensible for future backends

**Behavior**:
1. Loads Task + Asset + TaskDefinition + Plugin data
2. Serves HTML iframe with embedded JS/CSS from FrontendPlugin
3. JavaScript submits annotations back to `/api/annotations/` POST

---

## Plugin System

The plugin system enables dynamic, runtime loading of annotation UI components without redeploying the backend.

### Architecture

Plugins are stored in the `/frontends` directory (sibling to `/backend`). Each plugin is a separate bundle with its own manifest and build output.

```
frontends/
  shared/
    src/
  salient-poly/
    manifest.json
    src/
      App.tsx
      main.tsx
    dist/
      assets/
        index.js
        index.css
  instance-bbox/
    manifest.json
    src/
      App.tsx
      main.tsx
    dist/
      assets/
        index.js
        index.css
```

Current runtime truth:
- `frontends/shared/` is the small shared shell, hook, and geometry layer for plugins
- `frontends/salient-poly/`, `frontends/salient-tbi/`, `frontends/instance-bbox/`, and `frontends/pose-keypoints/` are the current React/Vite plugins
- the planned direction is a small shared frontend primitive layer plus separate task-specific plugins, not one universal annotator

### Manifest Structure & Validation

**Required Fields**:
- `name`: Human-readable plugin name
- `task_type`: Slug matching TaskType.slug
- `version`: Semantic version (e.g., "1.0.0")
- `root`: Relative path to plugin directory (validated to prevent path traversal)
- `js`: List of JavaScript file paths (relative to root)
- `css`: List of CSS file paths (relative to root)
- `result_schema_version`: Version of the result schema this plugin produces

**Validation Rules** (`plugin_validation.py`):

1. **Structure**: Must be a JSON object
2. **Required Fields**: All keys in REQUIRED_KEYS must be present
3. **Root Path**: Must be relative, exist on filesystem, not contain `..`, and not escape FRONTENDS_ROOT
4. **Asset Paths**: All JS/CSS files must exist relative to root
5. **Schema Version**: Must be a non-empty string
6. **Path Traversal**: All paths are validated with `_safe_path()` to prevent escaping root

**Validation Process** (in `FrontendPluginSerializer.validate()`):

```python
def validate(self, attrs):
    manifest = attrs.get("manifest") or {}
    try:
        manifest = validate_plugin_manifest(manifest)  # Raises ValidationError if invalid
    except DjangoValidationError as exc:
        raise serializers.ValidationError({"manifest": exc.messages})
    attrs["manifest"] = manifest

    # Ensure manifest task_type matches plugin task_type
    task_type = attrs.get("task_type") or getattr(self.instance, "task_type", None)
    manifest_task_type = manifest.get("task_type")
    if task_type and manifest_task_type and manifest_task_type != task_type.slug:
        raise serializers.ValidationError({
            "manifest": f"Manifest task_type ({manifest_task_type}) does not match plugin task_type ({task_type.slug})."
        })
    return attrs
```

### Loading & Serving Plugins

1. **Registration**: Plugin manifest is POSTed to `/api/plugins/` with task_type reference
2. **Storage**: Manifest is validated and stored in FrontendPlugin.manifest JSONField
3. **Delivery**: When a Task is loaded via `/api/tasks/{id}/bundle/`, the FrontendPlugin.manifest is included
4. **Annotate Shell**: The backend serves `/api/tasks/{task_id}/annotate/`, injects `window.__ANNO_LAB_BOOT__`, and references plugin assets through `/api/tasks/{task_id}/annotate/plugin/{asset_path}`
5. **Frontend Integration**: JavaScript loads task context from `window.__ANNO_LAB_BOOT__`, fetches `/api/tasks/{id}/bundle/`, and submits annotations to `/api/annotations/`
6. **Deactivation**: Set `is_active=False` to hide plugin without deletion (feature flag)

### Plugin Development Workflow

1. Create plugin directory in `/frontends/{name}/`
2. Build JS/CSS into `/dist/` subdirectory
3. Create `manifest.json`:
   ```json
   {
     "name": "My Annotation Tool",
     "task_type": "my_task_type",
     "version": "1.0.0",
     "root": "my-annotation-tool/dist",
     "js": ["assets/index.js"],
     "css": ["assets/index.css"],
     "result_schema_version": "1.0.0"
   }
   ```
4. POST to `/api/plugins/` with plugin metadata:
   ```json
   {
     "task_type": "<TaskType ID>",
     "name": "My Annotation Tool",
     "version": "1.0.0",
     "manifest": { /* full manifest JSON */ }
   }
   ```
5. On task load, the annotate shell resolves plugin assets for the selected task and the plugin fetches the task bundle at runtime

### Result Schema Versioning

- Each plugin declares a `result_schema_version` (e.g., "1.0.0")
- When annotations are submitted, they include `schema_version` matching that manifest field
- This allows tracking which plugin version produced each annotation
- Backend can validate result JSON against TaskDefinition.definition.label_schema if desired

---

## MTurk Integration

The MTurk integration provides a complete lifecycle for managing Amazon Mechanical Turk HITs and ingesting worker submissions.

### Architecture Overview

MTurk tasks are managed via Celery workers in a separate queue (`mturk`) to isolate long-running operations. The integration spans:

1. **HIT Creation** (`create_hit_for_task`, `create_hits_for_tasks`)
2. **Polling** (`sync_assignments_for_hit`, `sync_open_hits`)
3. **Ingestion** (`ingest_submitted_assignments`)

All operations support idempotency and automatic retries via Celery.

### HIT Lifecycle

#### 1. HIT Creation

**Celery Task**: `core.mturk.create_hit_for_task`

```python
create_hit_for_task(
    task_id=1,
    reward="0.10",               # Reward amount (USD)
    max_assignments=1,           # Number of assignments per HIT
    lifetime_seconds=86400       # HIT lifetime (24 hours)
)
```

**Process**:
1. Load Task + TaskDefinition + TaskType
2. Generate external question XML with iframe pointing to:
   ```
   {PUBLIC_BASE_URL}/api/tasks/{task_id}/annotate/mturk/?sandbox=0|1
   ```
3. Call `boto3_client.create_hit()` with title, description, reward, duration, lifetime
4. Create Assignment record with status="created" and payload snapshot
5. Log MTURK_HIT_CREATED event

**Assignment Record After Creation**:
```python
Assignment(
    task=task,
    backend="mturk",
    hit_id="3ABC456DEF...",
    status="created",
    sandbox=settings.MTURK_SANDBOX,
    payload={
        "creation": {
            "reward": "0.10",
            "max_assignments": 1,
            "lifetime_seconds": 86400
        }
    }
)
```

**Bulk HIT Creation**:
```python
create_hits_for_tasks(
    task_ids=[1, 2, 3, 4, 5],
    reward="0.10",
    max_assignments=1,
    lifetime_seconds=86400,
    batch_size=25  # Process in chunks to avoid rate limits
)
```
- Skips tasks that already have active assignments
- Returns { created: [...], skipped: [...] }

#### 2. Status Polling

**Celery Task**: `core.mturk.sync_assignments_for_hit`

Fetches the latest assignment statuses from MTurk API (called periodically via Beat scheduler).

```python
sync_assignments_for_hit(hit_id="3ABC456DEF...")
```

**Process**:
1. Find base Assignment record for hit_id
2. Call `boto3_client.list_assignments_for_hit()` with statuses: ["Submitted", "Approved", "Rejected"]
3. For each returned assignment record:
   - Get-or-create Assignment record (keyed by backend + assignment_id)
   - Extract worker_id, status, and answer XML
   - Parse MTurk answer XML (QuestionIdentifier + FreeText fields)
   - Update Assignment.payload with mturk_record, answers, and annotation_json (if present)
4. Return { seen: int, updated: int }

**Status Mapping**:
```
MTurk Status → Assignment Status
Approved     → approved
Rejected     → rejected
Returned     → returned
Expired      → expired
Other        → submitted
```

**Bulk Polling**:
```python
sync_open_hits(limit=25)
```
- Fetches up to 25 hit_ids with status in ["created", "submitted"]
- Polls each, returns aggregated { hits, assignments_seen, assignments_updated }
- Typically called via Celery Beat every 5-10 minutes

#### 3. Annotation Ingestion

**Celery Task**: `core.mturk.ingest_submitted_assignments`

Converts polled MTurk submissions into Annotation records.

```python
ingest_submitted_assignments(limit=20)
```

**Process**:
1. Query Assignment records with:
   - status in ["submitted", "approved"]
   - ingested_at is null
   - Ordered by updated_at (FIFO)
2. For each assignment:
   - Extract annotation_json from payload (populated by polling)
   - Skip if annotation_json is empty
   - Build AnnotationSerializer data:
     ```python
     {
       "task": assignment.task_id,
       "result": annotation_json,
       "schema_version": annotation_json.get("schema_version", ""),
       "submission_id": assignment.assignment_id,
       "assignment": assignment.id,
       "raw_payload": assignment.payload
     }
     ```
   - Check idempotency: skip if Annotation already exists for (task, submission_id)
   - Create Annotation via serializer
   - Update Assignment.ingested_at = now, status = "submitted"
   - Log MTURK_ASSIGNMENT_INGESTED event
3. Return { ingested: int, skipped: int }

**Idempotency**: If the same assignment is ingested twice, the Annotation creation endpoint returns the existing record with HTTP 200 (no error).

### Configuration

**Settings** (in `settings.py`):

```python
# Celery routing
CELERY_TASK_ROUTES = {
    "core.mturk.*": {"queue": "mturk"},  # Separate queue for MTurk tasks
}

# MTurk configuration
MTURK_SANDBOX = os.getenv("MTURK_SANDBOX", "1") == "1"  # Sandbox vs Production
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "http://localhost:8000")  # Callback URL base
AWS_REGION = os.getenv("AWS_REGION", "us-west-2")
```

**Boto3 Client Setup** (in `adapters/mturk/client.py`):

```python
def get_mturk_client():
    endpoint = (
        "https://mturk-requester-sandbox.us-east-1.amazonaws.com"
        if settings.MTURK_SANDBOX
        else "https://mturk-requester.us-east-1.amazonaws.com"
    )
    return boto3.client("mturk", region_name=settings.AWS_REGION, endpoint_url=endpoint)
```

### External Question XML

Generated by `adapters/mturk/templates.py`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ExternalQuestion xmlns="http://mturk.amazonaws.com/AWSMTurkHTMLQuestion">
  <ExternalURL>https://example.com/api/tasks/1/annotate/mturk/?sandbox=0</ExternalURL>
  <FrameHeight>950</FrameHeight>
</ExternalQuestion>
```

This instructs MTurk to render the annotation UI in an iframe.

### Data Flow Diagram

```
Task Created
     ↓
[create_hit_for_task] → MTurk API → HIT Created (status=created)
     ↓
Assignment Record Created (status=created)
     ↓
Worker Accepts HIT
     ↓
[Periodic sync_open_hits] → MTurk API → Poll Submissions
     ↓
[_sync_assignments] → Update Assignment (status=submitted/approved/etc.)
     ↓
Assignment.payload = {
  mturk_record: {...},
  answers: {...},
  annotation_json: {...}
}
     ↓
[ingest_submitted_assignments] → AnnotationSerializer
     ↓
Annotation Created (idempotent via submission_id)
     ↓
Assignment.ingested_at = now
```

---

## Security Model

### Write Token Authentication

All write operations (POST, PUT, PATCH, DELETE) are protected by a simple header-based token mechanism.

**Implementation** (in `permissions.py`):

```python
class HasWriteToken(BasePermission):
    """Simple header-based write protection.

    Allows read-only requests without a token.
    Requires header for write methods: X-Anno-Lab-Write-Token: <token>
    Disable by leaving WRITE_TOKEN empty.
    """

    def has_permission(self, request, view):
        # Always allow safe/read methods
        if request.method in SAFE_METHODS:
            return True

        token = (getattr(settings, "WRITE_TOKEN", "") or "").strip()
        if not token:
            return True  # Disabled

        provided = (request.headers.get("X-Anno-Lab-Write-Token", "") or "").strip()
        return provided == token
```

**Configuration**:

```python
# settings.py
WRITE_TOKEN = os.getenv("DJANGO_WRITE_TOKEN", "")
```

**Usage**:

```bash
# With token
curl -X POST http://localhost:8000/api/projects/ \
  -H "X-Anno-Lab-Write-Token: secret-key" \
  -H "Content-Type: application/json" \
  -d '{"slug": "proj1", "name": "Project 1"}'

# Without token (read-only)
curl http://localhost:8000/api/projects/
```

**Security Notes**:
- Token is compared as plain text (not hashed). Use HTTPS in production.
- Token is not per-user; it grants write access to all resources.
- SAFE_METHODS (GET, HEAD, OPTIONS) are always public.
- Can be disabled by leaving WRITE_TOKEN empty (development mode).
- For production, use environment variable or vault integration.

### Rate Limiting

Annotation submission (POST /api/annotations/) is rate-limited to prevent abuse.

**Implementation** (in `views.py`):

```python
from django_ratelimit.decorators import ratelimit
from django.utils.decorators import method_decorator

class AnnotationViewSet(viewsets.ModelViewSet):
    @method_decorator(ratelimit(key='ip', rate='100/h', method='POST'))
    def create(self, request, *args, **kwargs):
        # ...
```

**Limits**:
- 100 annotations per IP per hour
- Key is based on client IP address
- Returns HTTP 429 (Too Many Requests) when exceeded

**Rationale**: Prevents script-based spam and DoS attacks against annotation ingestion.

### Data Model Security

1. **Soft Deletes**: No soft deletes; use CASCADE or PROTECT on ForeignKey to enforce integrity
2. **Constraints**: Unique constraints on (backend, assignment_id) and (task, submission_id) prevent duplicates
3. **Audit Trail**: EventLog records all critical operations
4. **CORS**: Configured to allow all origins in development; tighten in production:
   ```python
   CORS_ALLOW_ALL_ORIGINS = True  # Dev only; use CORS_ALLOWED_ORIGINS in prod
   ```

### S3 Asset Access

Assets are stored in S3 with access via presigned URLs:

```python
# In Asset model
def presigned_url(self, expiration: int = 3600) -> str:
    """Generate time-limited S3 URL."""
    s3_client = boto3.client('s3', region_name=getattr(settings, 'AWS_REGION', 'us-east-1'))
    return s3_client.generate_presigned_url(
        'get_object',
        Params={'Bucket': settings.S3_BUCKET, 'Key': self.s3_key},
        ExpiresIn=expiration,
    )
```

**Benefits**:
- URLs expire after 1 hour (default) without shared secret exposure
- S3 access is authenticated via AWS IAM credentials (not exposed to clients)
- Clients never receive AWS credentials directly

---

## Deployment Architecture

The system is deployed as a containerized stack using Docker Compose, with separate services for web, async workers, and scheduled tasks.

### Docker Services

**docker-compose.yml**:

```yaml
services:
  web:
    build: .
    env_file: .env
    ports:
      - "8000:8000"
    depends_on:
      - db
      - redis
    volumes:
      - ./backend:/app/backend
      - ./frontends:/app/frontends
    command: >
      bash -lc "python manage.py migrate &&
               python manage.py runserver 0.0.0.0:8000"

  worker:
    build: .
    env_file: .env
    depends_on:
      - db
      - redis
    volumes:
      - ./backend:/app/backend
      - ./frontends:/app/frontends
    command: >
      bash -lc "celery -A anno_lab worker -l INFO -Q default,mturk"

  beat:
    build: .
    env_file: .env
    depends_on:
      - db
      - redis
    volumes:
      - ./backend:/app/backend
      - ./frontends:/app/frontends
    command: >
      bash -lc "celery -A anno_lab beat -l INFO"

  db:
    image: postgres:16
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7
    ports:
      - "6379:6379"

volumes:
  pgdata:
```

### Service Roles

#### Web Service
- Runs Django development server (or gunicorn in production)
- Handles all HTTP requests to `/api/` endpoints
- Executes database migrations on startup
- Thread-safe for concurrent requests

**Scaling**: Horizontal scaling via load balancer (nginx, ALB, etc.)

#### Worker Service
- Runs Celery worker daemon
- Consumes tasks from `default` and `mturk` queues
- Handles:
  - HIT creation (potentially long-running due to MTurk API)
  - Status polling and sync
  - Annotation ingestion
- Automatic retries with exponential backoff

**Configuration**:
```bash
celery -A anno_lab worker -l INFO -Q default,mturk
```
- `-Q default,mturk`: Listen on both queues
- `-l INFO`: Log level
- Supports multiple worker instances for horizontal scaling

#### Beat Service
- Runs Celery Beat scheduler
- Triggers periodic tasks:
  - `sync_open_hits` (every 5-10 minutes)
  - `ingest_submitted_assignments` (every 2-5 minutes)
  - Custom tasks as defined

**Single Instance**: Only one Beat service should run to avoid duplicate scheduling

#### Database Service
- PostgreSQL 16
- Persistent volume (`pgdata`) for data durability
- Required environment variables: POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD

#### Redis Service
- Redis 7
- Celery broker and result backend
- Session storage (optional)
- No persistence needed (Celery tasks are transient)

### Environment Configuration

**Sample .env**:

```bash
# Django
DJANGO_SECRET_KEY=your-secret-key-here
DJANGO_DEBUG=0
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,example.com
DJANGO_WRITE_TOKEN=your-write-token

# Database
POSTGRES_DB=anno_lab
POSTGRES_USER=anno_lab
POSTGRES_PASSWORD=your-db-password

# Redis
REDIS_URL=redis://redis:6379/0

# AWS
AWS_REGION=us-west-2
S3_BUCKET=my-assets-bucket
MTURK_SANDBOX=1

# URLs
PUBLIC_BASE_URL=http://localhost:8000
```

### Production Considerations

1. **Web Server**: Replace `runserver` with gunicorn/uWSGI
   ```dockerfile
   CMD ["gunicorn", "-b", "0.0.0.0:8000", "anno_lab.wsgi"]
   ```

2. **Database Backups**: Configure automated PostgreSQL backups

3. **Redis Persistence**: Enable AOF or RDB for fault tolerance

4. **Scaling**: Deploy multiple worker and web instances behind a load balancer

5. **Monitoring**: Add health checks:
   - `GET /api/health/` - General health
   - `GET /api/health/liveness/` - Liveness probe
   - `GET /api/health/readiness/` - Readiness probe

6. **Logging**: Aggregate logs to ELK, Datadog, or CloudWatch

7. **Secrets Management**: Use AWS Secrets Manager, HashiCorp Vault, or similar

8. **HTTPS**: Enforce TLS via reverse proxy (nginx, ALB)

9. **CORS**: Restrict allowed origins:
   ```python
   CORS_ALLOWED_ORIGINS = [
       "https://example.com",
       "https://app.example.com"
   ]
   ```

### Dockerfile Structure

```dockerfile
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend /app/backend
COPY frontends /app/frontends
WORKDIR /app/backend

CMD ["gunicorn", "anno_lab.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2", "--timeout", "120"]
```

The checked-in Docker image now bakes the backend tree plus the checked-in `frontends/` manifests
and built plugin bundles. Containerized deployments that use local-filesystem plugin asset serving
can rely on the image by default, but must rebuild the image after frontend bundle changes. S3
plugin storage remains the alternative when you want object-store backed plugin delivery.

### Database Initialization

On first deployment, run migrations:

```bash
docker compose run web python manage.py migrate
```

Create initial TaskType and TaskDefinition:

```bash
docker compose run web python manage.py shell << 'EOF'
from core.models import TaskType, TaskDefinition
tt = TaskType.objects.create(slug="my-task", name="My Task Type")
td = TaskDefinition.objects.create(
    task_type=tt,
    version="1.0",
    definition={"ui_config": {}, "label_schema": {}}
)
print(f"Created TaskType {tt.slug} with TaskDefinition v{td.version}")
EOF
```

---

## Summary

This architecture provides a scalable, extensible framework for human-in-the-loop annotation at scale. Key design decisions:

- **Separation of concerns**: Configuration, execution, and output layers are logically isolated
- **Extensibility**: Plugin system enables new UI implementations without backend changes
- **Auditability**: All operations are logged via EventLog for compliance
- **Idempotency**: Submission IDs prevent duplicate annotations
- **Scalability**: Celery workers and horizontal scaling support high throughput
- **Security**: Write token checks, fail-closed browser auth posture, and presigned S3 URLs protect against abuse

Developers inheriting this codebase should focus on:
1. Understanding the 9-model data structure and their relationships
2. Implementing new TaskTypes and TaskDefinitions for specific annotation tasks
3. Developing frontend plugins for custom annotation UIs
4. Extending MTurk integration or adding new crowdsourcing backends
5. Monitoring EventLog for audit trails and debugging
