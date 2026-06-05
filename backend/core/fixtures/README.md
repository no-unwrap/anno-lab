# Example Datasets

This directory contains example dataset fixtures for demonstrating the anno-lab annotation platform.

## Overview

The example dataset includes three complete annotation projects showcasing different task types:

1. **Binary Classification** - Simple yes/no classification tasks (e.g., "Does this image contain a cat?")
2. **Bounding Box Annotation** - Object detection with labeled bounding boxes
3. **Salient Polygon Annotation** - Polygon segmentation for salient objects

## Contents

### Projects

| ID | Slug | Name | Description |
|----|------|------|-------------|
| 1 | example-classification | Example Image Classification Project | Binary image classification tasks |
| 2 | example-bbox | Example Bounding Box Project | Object detection with bounding boxes |
| 3 | example-polygon | Example Polygon Annotation Project | Salient polygon annotation |

### Task Types

| ID | Slug | Name | Description |
|----|------|------|-------------|
| 1 | binary-classification | Binary Classification | Simple yes/no classification tasks |
| 2 | bbox-annotation | Bounding Box Annotation | Draw bounding boxes around objects of interest |
| 3 | salient-polygon | Salient Polygon Annotation | Draw polygons around salient objects in images |

### Assets

The dataset includes 6 sample image assets:
- 2 classification images (cat, landscape)
- 2 detection images (street scene, parking lot)
- 2 polygon annotation images (objects)

**Note:** These are placeholder S3 keys. For a working demo, you'll need to:
1. Upload actual images to S3 at these paths, OR
2. Modify the `s3_key` values to point to your own images

### Tasks & Annotations

The dataset includes:
- 6 tasks (2 per project)
- 3 example annotations (1 per project, demonstrating different formats)

Each completed task includes a sample annotation showing the expected result format for that task type.

Plugin note:
- this fixture is sample data, not the plugin-ready browser demo path
- the included task-type slugs (`binary-classification`, `bbox-annotation`, `salient-polygon`) are legacy sample names and do not match the current plugin manifest slugs
- for the live plugin demo flow with `bbox` and `salient_poly`, follow [demo.md](../../../demo.md)

## Loading the Example Dataset

### Quick Start

```bash
# Load examples into a fresh database
POSTGRES_HOST=localhost python backend/manage.py migrate
POSTGRES_HOST=localhost python backend/manage.py load_examples

# Load examples and clear existing data (WARNING: destructive)
POSTGRES_HOST=localhost python backend/manage.py load_examples --reset

# Skip confirmation prompt when resetting
POSTGRES_HOST=localhost python backend/manage.py load_examples --reset --skip-confirmation
```

### Manual Loading

You can also load the fixture manually:

```bash
POSTGRES_HOST=localhost python backend/manage.py loaddata backend/core/fixtures/example_dataset.json
```

## Using the Example Dataset

After loading the examples, you can:

### 1. View Projects via API

```bash
# List all projects
curl http://localhost:8000/api/projects/

# Get project details
curl http://localhost:8000/api/projects/1/

# View project statistics
curl http://localhost:8000/api/projects/1/stats/
```

### 2. Export Project Data

```bash
# Export the private raw collection bundle
curl \
  -H "X-Anno-Lab-Write-Token: your-token-here" \
  http://localhost:8000/api/projects/1/export/ \
  > raw_collection_export.json
```

Export note:
- these exports are raw anno-lab collection snapshots
- they are intended as versioned exports rather than cleaned release artifacts
- consumers should read exported files rather than anno-lab database tables directly
- the bundle preserves project/task/task-definition context plus raw MTurk
  assignment payloads and linked annotation provenance
- downstream format conversion, cleaning, and release packaging belong in
  `label-lab`, not in `anno-lab`

### 3. Explore Tasks

```bash
# List all tasks
curl http://localhost:8000/api/tasks/

# Get task bundle (everything needed for annotation)
curl http://localhost:8000/api/tasks/1/bundle/
```

### 4. Create New Annotations

```bash
# Submit a new annotation
curl -X POST http://localhost:8000/api/annotations/ \
  -H "Content-Type: application/json" \
  -H "X-Anno-Lab-Write-Token: your-token-here" \
  -d '{
    "task": 2,
    "result": {"answer": "no", "confidence": "medium"},
    "schema_version": "1.0.0",
    "tool_version": "1.0.0",
    "actor": "test_user"
  }'
```

## Example Annotation Formats

### Binary Classification

```json
{
  "answer": "yes",
  "confidence": "high"
}
```

### Bounding Box Annotation

```json
{
  "boxes": [
    {
      "class": "person",
      "x": 100,
      "y": 150,
      "width": 80,
      "height": 200,
      "confidence": 0.95
    },
    {
      "class": "vehicle",
      "x": 400,
      "y": 300,
      "width": 150,
      "height": 100,
      "confidence": 0.88
    }
  ]
}
```

### Salient Polygon Annotation

```json
{
  "polygon": {
    "points": [
      {"x": 200, "y": 100},
      {"x": 350, "y": 120},
      {"x": 400, "y": 250},
      {"x": 350, "y": 380},
      {"x": 200, "y": 400},
      {"x": 150, "y": 250}
    ],
    "label": "primary_object"
  }
}
```

## Extending the Examples

You can use these examples as templates for your own projects:

### 1. Duplicate a Task

```bash
# Create a new task based on task 1 with a different asset
curl -X POST http://localhost:8000/api/tasks/1/duplicate/ \
  -H "Content-Type: application/json" \
  -H "X-Anno-Lab-Write-Token: your-token-here" \
  -d '{"asset_id": 2, "assigned_to": "annotator@example.com"}'
```

### 2. Create Your Own Project

```python
from core.models import Project, TaskType, TaskDefinition

# Create a new project
project = Project.objects.create(
    slug='my-custom-project',
    name='My Custom Annotation Project',
    description='Custom annotation tasks for my research'
)

# Create or reuse a task type
task_type = TaskType.objects.get(slug='binary-classification')

# Define your custom task
task_def = TaskDefinition.objects.create(
    task_type=task_type,
    version='1.0.0',
    definition={
        'question': 'Is this image visually appealing?',
        'options': ['yes', 'no', 'neutral'],
        'instructions': 'Rate the aesthetic quality of the image.'
    }
)
```

### 3. Bulk Import Assets

```python
from core.models import Asset, Task

# Bulk create assets
assets = [
    Asset(
        project=project,
        media_type='image',
        s3_key=f'my-dataset/image_{i:04d}.jpg',
        sha256=f'hash_{i}',
        width=1024,
        height=768,
        metadata={'batch': 'initial'}
    )
    for i in range(100)
]
Asset.objects.bulk_create(assets)

# Bulk create tasks
tasks = [
    Task(
        project=project,
        asset=asset,
        task_definition=task_def,
        status='pending',
        priority=1
    )
    for asset in Asset.objects.filter(project=project)
]
Task.objects.bulk_create(tasks)
```

## Troubleshooting

### "IntegrityError: duplicate key value"

If you see this error, the database already contains data. Use `--reset` to clear it first:

```bash
POSTGRES_HOST=localhost python backend/manage.py load_examples --reset
```

### "S3 bucket does not exist"

The example dataset uses placeholder S3 keys. To test with real images:

1. Upload images to your S3 bucket at the paths specified in the fixture
2. Set `S3_BUCKET` in your environment variables
3. Ensure AWS credentials are configured

Alternatively, modify the fixture to use your own S3 keys.

### "Permission denied" when creating annotations

Make sure you're including the write token header:

```bash
curl -H "X-Anno-Lab-Write-Token: your-secret-token" ...
```

The token should match the `DJANGO_WRITE_TOKEN` environment variable.

## Notes

- This is a **minimal** example dataset for demonstration purposes
- Real research projects will have hundreds or thousands of tasks
- Asset metadata can store arbitrary JSON for your specific needs
- Task definitions are versioned to support evolving requirements
- All timestamps use ISO 8601 format with UTC timezone
- The `raw_payload` field preserves the complete submission including timing data

## Related Documentation

- [Architecture Guide](../../../docs/architecture.md) - Complete system documentation
- [Plugin Development Guide](../../../docs/plugin-guide.md) - Build custom annotation UIs
- [Deployment Guide](../../../docs/deployment.md) - Production deployment options
