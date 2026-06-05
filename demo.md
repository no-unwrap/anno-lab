# Plugin Demo Guide

Use this document to bring up anno-lab locally and exercise the current plugin ecosystem as it grows.

This is not a one-off meeting script. It is the standing demo and smoke-test walkthrough for:
- the shared frontend shell under `frontends/shared/`
- the current plugin surfaces under `frontends/salient-poly/`, `frontends/instance-bbox/`, and `frontends/pose-keypoints/`
- plugin registration, task-bundle delivery, annotate-shell loading, and browser-side submission behavior

## Demo Modes

Use one of these modes depending on what you are testing:

1. Frontend-only sandbox
   Best for plugin design work, shared-shell iteration, layout changes, interaction design, and quick visual QA.
2. Backend-integrated demo
   Best for validating the real plugin ecosystem: manifests, DB registration, task bundles, annotate shells, and end-to-end browser behavior.

Important runtime notes:
- the seed data loaded by `load_examples` does not automatically register the active plugins
- the seed fixture task-type slugs do not match the current plugin manifests, so backend-integrated plugin demos need explicit setup
- the stock browser annotate shell only supports direct annotation writes when backend `WRITE_TOKEN` is empty or when you provide your own trusted token-delivery path
- full browser annotation also requires real asset delivery; on a bare local checkout without configured asset delivery, the shell can load but the image area will fall back to an empty state

## Prerequisites

Bootstrap the repo once:

```bash
cd /path/to/anno-lab
python -m venv .venv
source .venv/bin/activate
just setup
cp .env.example .env
docker compose up -d db redis
POSTGRES_HOST=localhost python backend/manage.py migrate
```

Install the current plugin surfaces:

```bash
npm --prefix frontends/salient-poly install
npm --prefix frontends/instance-bbox install
npm --prefix frontends/pose-keypoints install
just frontend-build
```

Optional seed data:

```bash
POSTGRES_HOST=localhost python backend/manage.py load_examples
```

Recommended baseline validation before any demo session:

```bash
python backend/manage.py check
just frontend-typecheck
just frontend-test
```

## Mode 1: Frontend-Only Sandbox

Use this when you want to work on the plugin family quickly without waiting on backend setup, plugin registration, or asset delivery.

Run the instance-bbox sandbox:

```bash
npm --prefix frontends/instance-bbox run dev -- --host 0.0.0.0 --port 4174
```

Run the salient polygon sandbox in a second terminal:

```bash
npm --prefix frontends/salient-poly run dev -- --host 0.0.0.0 --port 4175
```

Run the pose-keypoints sandbox in a third terminal:

```bash
npm --prefix frontends/pose-keypoints run dev -- --host 0.0.0.0 --port 4176
```

Open:
- `http://localhost:4174/`
- `http://localhost:4175/`
- `http://localhost:4176/`

What to expect:
- each plugin uses its built-in fallback image because there is no backend boot payload
- shared-shell structure, rails, status surfaces, and keyboard affordances are visible
- submission is intentionally disabled because there is no `taskId`

Use this mode to test:
- visual consistency across plugins
- shared-shell composition
- hotkeys and selection behavior
- instance-bbox drawing ergonomics, salient polygon editing ergonomics, and pose-keypoint ordering
- empty, ready, warning, and saved-state messaging

## Mode 2: Backend-Integrated Demo

Use this when you want to test the real plugin ecosystem through Django, the database, and the annotate shell.

### 1. Start the app services

```bash
docker compose up -d web worker beat
```

### 2. Make sure browser writes are allowed for a stock local demo

For direct browser submission through the stock annotate shell:
- keep `WRITE_TOKEN` empty in `.env`, then restart `web`
- or provide your own trusted browser token wrapper if you intentionally run with `WRITE_TOKEN` enabled

If `WRITE_TOKEN` is enabled and you do not have a trusted wrapper, public browser submission is expected to fail closed.

### 3. Create matching task types and task definitions

The active plugin manifests expect `instance_bbox`, `salient_poly`, and `pose_keypoints` task-type slugs. Create or refresh those slugs:

```bash
POSTGRES_HOST=localhost python backend/manage.py shell <<'PY'
from core.models import TaskDefinition, TaskType

instance_bbox_type, _ = TaskType.objects.update_or_create(
    slug="instance_bbox",
    defaults={
        "name": "Instance Bounding Box",
        "description": "Draw labeled bounding boxes around visible object instances.",
    },
)
salient_type, _ = TaskType.objects.update_or_create(
    slug="salient_poly",
    defaults={
        "name": "Salient Polygon",
        "description": "Trace salient objects with polygons.",
    },
)
pose_type, _ = TaskType.objects.update_or_create(
    slug="pose_keypoints",
    defaults={
        "name": "Pose Keypoints",
        "description": "Annotate one primary person with ordered body landmarks.",
    },
)

TaskDefinition.objects.update_or_create(
    task_type=instance_bbox_type,
    version="1.0.0",
    defaults={
        "definition": {
            "instructions": "Draw tight boxes around each visible object instance.",
            "object_classes": ["person", "vehicle", "animal"],
            "min_box_size": 12,
        }
    },
)
TaskDefinition.objects.update_or_create(
    task_type=salient_type,
    version="1.0.0",
    defaults={
        "definition": {
            "instructions": "Trace each salient object with its own polygon.",
            "min_points": 3,
        }
    },
)
TaskDefinition.objects.update_or_create(
    task_type=pose_type,
    version="1.0.0",
    defaults={
        "definition": {
            "instructions": "Annotate one primary person with the ordered keypoint list.",
            "subject_label": "Primary person",
            "landmarks": [
                {"id": "nose", "label": "Nose", "color": "#f28f16"},
                {"id": "left_shoulder", "label": "Left shoulder", "color": "#116466"},
                {"id": "right_shoulder", "label": "Right shoulder", "color": "#3a7d44"},
                {"id": "pelvis", "label": "Pelvis", "color": "#6d597a"},
            ],
            "skeleton": [
                ["nose", "left_shoulder"],
                ["nose", "right_shoulder"],
                ["left_shoulder", "pelvis"],
                ["right_shoulder", "pelvis"],
            ],
        }
    },
)

print("Ready task types:", list(TaskType.objects.filter(slug__in=['instance_bbox', 'salient_poly', 'pose_keypoints']).values_list('slug', flat=True)))
PY
```

### 4. Register the current plugins

```bash
PYTHONPATH=backend python -m anno_lab.cli register-plugin frontends/instance-bbox --task-type instance_bbox
PYTHONPATH=backend python -m anno_lab.cli register-plugin frontends/salient-poly --task-type salient_poly
PYTHONPATH=backend python -m anno_lab.cli register-plugin frontends/pose-keypoints --task-type pose_keypoints
POSTGRES_HOST=localhost python backend/manage.py validate_plugins --strict
```

### 5. Create browser-demo tasks

For a real image-backed annotate-shell demo, point the tasks at asset keys that resolve through your configured asset-delivery path.

Set your own keys first:

```bash
export DEMO_INSTANCE_BBOX_KEY="demo/instance-bbox/street-scene.jpg"
export DEMO_SALIENT_KEY="demo/salient/object.jpg"
export DEMO_POSE_KEYPOINTS_KEY="demo/pose-keypoints/person.jpg"
```

Then create or refresh a demo project, assets, and tasks:

```bash
POSTGRES_HOST=localhost python backend/manage.py shell <<'PY'
import os

from core.models import Asset, Project, Task, TaskDefinition

instance_bbox_key = os.environ.get("DEMO_INSTANCE_BBOX_KEY", "").strip()
salient_key = os.environ.get("DEMO_SALIENT_KEY", "").strip()
pose_keypoints_key = os.environ.get("DEMO_POSE_KEYPOINTS_KEY", "").strip()
if not instance_bbox_key or not salient_key or not pose_keypoints_key:
    raise SystemExit(
        "Set DEMO_INSTANCE_BBOX_KEY, DEMO_SALIENT_KEY, and DEMO_POSE_KEYPOINTS_KEY before running this snippet."
    )

project, _ = Project.objects.update_or_create(
    slug="plugin-demo",
    defaults={
        "name": "Plugin Demo Workspace",
        "description": "Local operator demo project for current frontend plugins.",
    },
)

instance_bbox_def = TaskDefinition.objects.get(task_type__slug="instance_bbox", version="1.0.0")
salient_def = TaskDefinition.objects.get(task_type__slug="salient_poly", version="1.0.0")
pose_keypoints_def = TaskDefinition.objects.get(task_type__slug="pose_keypoints", version="1.0.0")

instance_bbox_asset, _ = Asset.objects.update_or_create(
    project=project,
    s3_key=instance_bbox_key,
    defaults={
        "media_type": "image",
        "width": 1600,
        "height": 1200,
        "metadata": {"source": "plugin_demo", "plugin": "instance-bbox"},
    },
)
salient_asset, _ = Asset.objects.update_or_create(
    project=project,
    s3_key=salient_key,
    defaults={
        "media_type": "image",
        "width": 1600,
        "height": 1200,
        "metadata": {"source": "plugin_demo", "plugin": "salient_poly"},
    },
)
pose_keypoints_asset, _ = Asset.objects.update_or_create(
    project=project,
    s3_key=pose_keypoints_key,
    defaults={
        "media_type": "image",
        "width": 1600,
        "height": 1200,
        "metadata": {"source": "plugin_demo", "plugin": "pose_keypoints"},
    },
)

instance_bbox_task, _ = Task.objects.update_or_create(
    project=project,
    asset=instance_bbox_asset,
    task_definition=instance_bbox_def,
    defaults={"status": "pending", "priority": 1, "payload": {}},
)
salient_task, _ = Task.objects.update_or_create(
    project=project,
    asset=salient_asset,
    task_definition=salient_def,
    defaults={"status": "pending", "priority": 1, "payload": {}},
)
pose_keypoints_task, _ = Task.objects.update_or_create(
    project=project,
    asset=pose_keypoints_asset,
    task_definition=pose_keypoints_def,
    defaults={"status": "pending", "priority": 1, "payload": {}},
)

print("instance-bbox annotate:", f"http://localhost:8000/api/tasks/{instance_bbox_task.id}/annotate/")
print("salient annotate:", f"http://localhost:8000/api/tasks/{salient_task.id}/annotate/")
print("pose-keypoints annotate:", f"http://localhost:8000/api/tasks/{pose_keypoints_task.id}/annotate/")
print("instance-bbox bundle:", f"http://localhost:8000/api/tasks/{instance_bbox_task.id}/bundle/")
print("salient bundle:", f"http://localhost:8000/api/tasks/{salient_task.id}/bundle/")
print("pose-keypoints bundle:", f"http://localhost:8000/api/tasks/{pose_keypoints_task.id}/bundle/")
PY
```

### 6. Open the annotate shells

Open the URLs printed by the setup snippet, or use:

- `http://localhost:8000/api/tasks/<instance_bbox_task_id>/annotate/`
- `http://localhost:8000/api/tasks/<salient_task_id>/annotate/`
- `http://localhost:8000/api/tasks/<pose_keypoints_task_id>/annotate/`

What to verify:
- the annotate shell loads without asset-path errors
- the task bundle includes the correct plugin manifest
- instance-bbox, salient-poly, and pose-keypoints all inherit the shared shell while keeping task-specific tools
- browser submission succeeds when `WRITE_TOKEN` is empty
- selection and feedback behave consistently across all three plugins

If you do not have configured asset delivery:
- the shell and bundle path can still be tested
- the plugin will show its empty-image state instead of a full annotation workspace
- use Mode 1 for visual/plugin ergonomics until asset delivery is configured

## API Checks During a Demo

Useful endpoints while the system is live:

```bash
curl http://localhost:8000/api/health/ | jq .
curl http://localhost:8000/api/projects/ | jq .
curl http://localhost:8000/api/task-types/ | jq '.[] | {slug: .slug, name: .name}'
curl http://localhost:8000/api/plugins/ | jq '.results[] | {task_type: .task_type, version: .version}'
curl http://localhost:8000/api/tasks/<task_id>/bundle/ | jq .
curl http://localhost:8000/api/projects/<project_id>/stats/ | jq .
```

Use these to confirm:
- plugin registration
- task-type to plugin alignment
- bundle shape
- task and annotation counts
- health of the local stack

## Adding Another Plugin To The Demo Surface

When a new plugin is added:

1. Install its npm dependencies.
2. Build it with the existing frontend recipes.
3. Create or update a matching `TaskType.slug`.
4. Register the plugin with `python -m anno_lab.cli register-plugin ...`.
5. Create a `TaskDefinition` and at least one `Task` that points at a real asset.
6. Run `POSTGRES_HOST=localhost python backend/manage.py validate_plugins --strict`.
7. Open `/api/tasks/{task_id}/annotate/` and compare its shell behavior against `instance-bbox` and `salient-poly`.

## Troubleshooting

`validate_plugins --strict` says no plugins are registered:
- run the two `register-plugin` commands from the backend-integrated setup

The annotate shell loads but no image appears:
- confirm `S3_BUCKET` or your asset-delivery path is configured
- confirm the asset keys you used in `DEMO_BBOX_KEY` and `DEMO_SALIENT_KEY` are real
- use the frontend-only sandbox if you only need shell and interaction testing

The bundle response has `"plugin": null`:
- the task type does not have an active `FrontendPlugin`
- or the task-type slug does not match the plugin manifest `task_type`

Browser submission returns `403`:
- `WRITE_TOKEN` is enabled and the stock shell has no trusted browser token
- clear `WRITE_TOKEN` for local demos or use a trusted wrapper

You want a cheap cross-plugin smoke test before a larger session:

```bash
python backend/manage.py check
just frontend-build
just frontend-typecheck
just frontend-test
POSTGRES_HOST=localhost python backend/manage.py validate_plugins --strict
```

## Related References

- `README.md` for compact repo orientation
- `docs/runbooks.md` for the broader command matrix
- `docs/plugin-guide.md` for plugin contracts and registration details
- `docs/frontend-plugin-design-principles.md` for shared-shell and workspace behavior
