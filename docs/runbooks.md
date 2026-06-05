# Runbooks

## Purpose

Public technical guide for setup, execution, debugging, and validation.

This is the detailed home for command and launch-reference material. Other docs should point here instead of repeating the same long-form command lists.

## Local Environment Source

- the local environment file lives at the repo root as `.env`
- keep `.env.example` placeholder-only and never commit `.env`
- recommended pattern:

```bash
set -a
source .env >/dev/null 2>&1
set +a
```

## Setup

Create and activate a virtual environment:

```bash
python -m venv .venv
source .venv/bin/activate
```

Install dependencies:

```bash
just setup
```

Create a local environment file:

```bash
cp .env.example .env
```

Infrastructure:

```bash
docker compose up -d db redis
```

Database migrations:

```bash
POSTGRES_HOST=localhost python backend/manage.py migrate
```

Frontend bundle prerequisite:

```bash
npm --prefix frontends/salient-poly install
npm --prefix frontends/salient-tbi install
npm --prefix frontends/instance-bbox install
npm --prefix frontends/pose-keypoints install
just frontend-build
```

Notes:
- `.env.example` keeps `POSTGRES_HOST=db` for the Docker Compose network; when you run DB-backed `backend/manage.py` commands from the host shell against that published Postgres port, prefix them with `POSTGRES_HOST=localhost`
- build the registered plugins before running `python backend/manage.py validate_plugins --strict`
- `frontends/salient-poly/`, `frontends/salient-tbi/`, `frontends/instance-bbox/`, and `frontends/pose-keypoints/` are the buildable React/Vite plugins today, and `frontends/shared/` is the small cross-plugin source layer they import directly

Application services:

```bash
docker compose up -d web worker beat
```

Offline salient_tbi seed import:

```bash
python backend/manage.py import_salient_tbi_seeds support/salient-tbi/example-proposal-batch.json --dry-run
python backend/manage.py import_salient_tbi_seeds /path/to/pilot-batch.json --overwrite-stale
```

Notes:
- `AL-ENG-05b` is offline-only; the browser and MTurk flows never talk directly to cluster inference
- cluster jobs should emit bounded artifact JSON matching `support/salient-tbi/proposal-batch.schema.json`
- trusted writeback happens through `import_salient_tbi_seeds`, which writes only `Task.payload.pre_annotations`

## Command Matrix

Raw commands:

```bash
python backend/manage.py check
PYTHONPATH=backend python -m pytest -q
PYTHONPATH=backend python -m ruff check backend
python -m radon cc backend/core backend/anno_lab -s -a
POSTGRES_HOST=localhost python backend/manage.py validate_plugins --strict
POSTGRES_HOST=localhost python backend/manage.py load_examples
npm --prefix frontends/salient-poly run build
npm --prefix frontends/instance-bbox run build
npm --prefix frontends/pose-keypoints run build
npm --prefix frontends/salient-poly run lint
npm --prefix frontends/instance-bbox run lint
npm --prefix frontends/pose-keypoints run lint
npm --prefix frontends/salient-poly run typecheck
npm --prefix frontends/instance-bbox run typecheck
npm --prefix frontends/pose-keypoints run typecheck
npm --prefix frontends/salient-poly run test
npm --prefix frontends/instance-bbox run test
npm --prefix frontends/pose-keypoints run test
npm --prefix frontends/salient-poly run refactor:unused
npm --prefix frontends/instance-bbox run refactor:unused
npm --prefix frontends/pose-keypoints run refactor:unused
```

Just commands:

```bash
just setup
just django-check
just lint
just refactor-complexity
just test
POSTGRES_HOST=localhost just validate-plugins
just frontend-build
just frontend-lint
just frontend-typecheck
just frontend-test
just refactor-frontend-unused
POSTGRES_HOST=localhost just load-examples
just smoke
```

## Validation Sequences

General runtime validation:

```bash
python backend/manage.py check
POSTGRES_HOST=localhost python backend/manage.py validate_plugins --strict
PYTHONPATH=backend python -m pytest -q
```

Plugin-surface changes:

```bash
just frontend-build
just frontend-test
POSTGRES_HOST=localhost python backend/manage.py validate_plugins --strict
git diff --check
```

General runtime smoke:

```bash
python backend/manage.py check
PYTHONPATH=backend python -m pytest -q
```

## Operator Export

Export the private raw collection bundle from the CLI:

```bash
anno-lab export-project-data my-project --output raw_collection_export.json
```

API equivalent:

```bash
curl \
  -H "X-Anno-Lab-Write-Token: $WRITE_TOKEN" \
  http://localhost:8000/api/projects/1/export/ \
  > raw_collection_export.json
```

Notes:
- this bundle is intentionally raw and can include MTurk worker identifiers,
  assignment snapshots, answer payloads, and linked annotation provenance
- downstream cleaning, normalization, analysis, and publishing belong in
  `label-lab`

## Targeted Backend Suites

Run focused suites when changing narrower surfaces:

```bash
PYTHONPATH=backend python -m pytest -q backend/core/tests/test_project_api.py
PYTHONPATH=backend python -m pytest -q backend/core/tests/test_plugin_family_acceptance.py
PYTHONPATH=backend python -m pytest -q backend/core/tests/test_security.py
PYTHONPATH=backend python -m pytest -q backend/core/tests/test_ui_views.py
PYTHONPATH=backend python -m pytest -q backend/core/tests/test_mturk.py
PYTHONPATH=backend python -m pytest -q backend/core/tests/test_docs_consistency.py
```

## Demo Baseline

```bash
python backend/manage.py check
just frontend-build
just frontend-typecheck
just frontend-test
POSTGRES_HOST=localhost python backend/manage.py validate_plugins --strict
```

## References

- `README.md` for compact repo orientation
- `demo.md` for step-by-step demo walkthroughs
- `backend/core/TEST_README.md` for backend test detail
- `docs/plugin-guide.md` for the plugin contract
- `docs/deployment.md` for deployment detail
- `docs/frontend-plugin-design-principles.md` for frontend interaction guidance
