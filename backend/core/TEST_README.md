# Backend Test Guide

Backend tests live under `backend/core/tests/` and run through `pytest`.

The default test settings are in `backend/anno_lab/test_settings.py`:
- SQLite is used for the test database
- Celery tasks run eagerly
- password hashing is reduced for faster test execution

## Default Commands

From the repo root:

```bash
just test
PYTHONPATH=backend python -m pytest -q
```

## Targeted Commands

Run focused suites when you are changing a narrower surface:

```bash
PYTHONPATH=backend python -m pytest -q backend/core/tests/test_project_api.py
PYTHONPATH=backend python -m pytest -q backend/core/tests/test_plugin_family_acceptance.py
PYTHONPATH=backend python -m pytest -q backend/core/tests/test_security.py
PYTHONPATH=backend python -m pytest -q backend/core/tests/test_ui_views.py
PYTHONPATH=backend python -m pytest -q backend/core/tests/test_mturk.py
PYTHONPATH=backend python -m pytest -q backend/core/tests/test_docs_consistency.py
```

## Coverage Areas

The backend test suite currently covers:
- project stats and export behavior
- backend-integrated registration, bundle delivery, shell loading, submission idempotency, and provenance across the live three-plugin family
- annotation submission safety and idempotency
- write-token protection and plugin asset isolation
- MTurk helpers and assignment model behavior
- plugin registration and validation rules
- documentation consistency checks for README and docs surfaces

## Notes

- prefer root-level commands so they match the rest of the repo documentation
- if a change affects plugin assets or annotate-shell behavior, pair backend tests with the frontend checks in `docs/runbooks.md`
