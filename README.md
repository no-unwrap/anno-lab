# anno-lab

Human-in-the-loop annotation platform for long-lived research datasets.

A durable, API-first backend with hot-swappable annotation frontends, designed for long-lived research datasets and MTurk-style workflows.

## Design Intent

`anno-lab` is designed as a research instrument, not a one-off data collection tool.

Many annotation systems optimize for speed or simplicity. `anno-lab` optimizes for longevity, interpretability, and auditability in research contexts where:
- label definitions evolve over time
- annotation UIs influence outcomes
- annotator populations are heterogeneous
- old annotations must remain meaningful years later

Key principle:
- new task types, schemas, and frontends should be added without modifying or invalidating prior annotations

Frontend architecture conventions:
- keep plugins task-specific instead of collapsing them into one universal annotator
- extract only small shared frontend primitives once multiple live plugins prove the same user-visible contract
- keep plugin UX highly usable for annotators while preserving clear task-specific tools
- make plugins feel like one coherent product family even when their task mechanics differ

## Repo Map

- `backend/`: active Django runtime
- `backend/core/`: canonical domain, API, permissions, plugin-validation, and MTurk surface
- `backend/anno_lab/`: settings, CLI, and Django wiring
- `frontends/`: annotation plugin bundles and source trees
- `docs/README.md`: docs index
- `docs/runbooks.md`: detailed setup, command, and validation reference
- `demo.md`: frontend sandbox and backend-integrated demo walkthrough
- `docs/architecture.md`: system and module map
- `docs/plugin-guide.md`: frontend plugin contract and development reference
- `docs/frontend-plugin-design-principles.md`: UX and interaction principles for the plugin family
- `docs/deployment.md`: deployment reference

## 60-Second Setup

1. Use a Python environment that already contains the repo dependencies.
On declaratively managed workstations, no repo-local `.venv` is required.

2. Sanity-check the environment.

```bash
just setup
```

3. Create a local environment file.

```bash
cp .env.example .env
```

If you keep separate ignored credential profiles such as `.env.personal` and `.env.ivc`, use `.env` only for the active default profile. Host-shell Django commands can load a specific profile explicitly with `ANNO_LAB_ENV_FILE=.env.personal python backend/manage.py ...`, and Compose can use `docker compose --env-file .env.personal ...`.

4. Start supporting services.

```bash
docker compose up -d db redis
```

`.env.example` keeps `POSTGRES_HOST=db` for the Docker Compose network. If you run DB-backed `backend/manage.py` commands from the host shell against that Docker-published Postgres, prefix them with `POSTGRES_HOST=localhost`.

5. Run migrations.

```bash
POSTGRES_HOST=localhost python backend/manage.py migrate
```

## Quick Start

Application services:

```bash
docker compose up -d web worker beat
```

Example data:

```bash
POSTGRES_HOST=localhost python backend/manage.py load_examples
```

Reference frontend bundle prerequisite for live plugin validation or annotate-shell work:

```bash
npm --prefix frontends/salient-poly install
npm --prefix frontends/instance-bbox install
npm --prefix frontends/pose-keypoints install
just frontend-build
```

Validation:

```bash
python backend/manage.py check
POSTGRES_HOST=localhost python backend/manage.py validate_plugins --strict
PYTHONPATH=backend python -m pytest -q
```

Frontend quality checks:

```bash
just frontend-lint
just frontend-typecheck
just frontend-test
```

Visit:
- API root: http://localhost:8000/api/
- OpenAPI schema: http://localhost:8000/api/schema/
- Swagger UI: http://localhost:8000/api/docs/

## How It Works

A UI is selected at runtime by resolving:

```text
Task -> TaskDefinition -> TaskType -> FrontendPlugin
```

Each `FrontendPlugin` registers a compiled UI bundle via a manifest. The backend injects that bundle into a minimal HTML shell at `/api/tasks/<task_id>/annotate/`.

No frontend code is baked into Django.

This separation is intentional:
- annotation logic lives in frontends
- provenance, MTurk orchestration, ingestion, and raw collection export live in the backend
- downstream cleaning, format conversion, analysis, and publishing belong outside this repo

## Core Concepts

- `TaskType`: logical annotation task such as `instance_bbox`, `salient_poly`, or `qa`
- `TaskDefinition`: versioned JSON schema defining labeling rules and semantics
- `Task`: unit of work tied to an asset and task definition
- `Annotation`: versioned result JSON submitted by a frontend
- `FrontendPlugin`: compiled UI bundle registered via manifest

## Safety Posture

- keep MTurk sandbox versus production intent explicit
- keep `.env.example` placeholder-only
- preserve idempotent annotation ingestion
- preserve manifest path validation and plugin asset isolation
- preserve versioned task semantics rather than mutating historical truth in place

## Docs Map

- `docs/README.md`: docs index
- `docs/runbooks.md`: bootstrap, command matrix, and validation sequences
- `demo.md`: demo walkthrough for the current plugin ecosystem
- `docs/architecture.md`: system and module map
- `docs/plugin-guide.md`: plugin contracts and development guidance
- `docs/frontend-plugin-design-principles.md`: shared UX, shell, and interaction principles for plugins
- `docs/deployment.md`: deployment options and environment guidance

## License

This project is licensed under the MIT License. See `LICENSE` for the full text.
