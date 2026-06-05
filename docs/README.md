# Docs Index

Use this folder for:
- architecture, deployment, and plugin-development references
- setup, validation, and demo guidance
- UI contract and interaction guidance for the current frontend surfaces

Active runtime note:
- `backend/` is the live Django runtime tree
- `backend/core/` is the main Django app and annotation-domain surface
- `frontends/` is the active plugin runtime tree
- `demo.md` is the main walkthrough for sandbox and backend-integrated plugin demos

Validation note:
- the default backend test command is `PYTHONPATH=backend python -m pytest -q`
- `backend/core/TEST_README.md` is the backend test reference
- `docs/runbooks.md` is the detailed setup and validation guide

Current high-value docs:
- `docs/architecture.md`
- `docs/plugin-guide.md`
- `docs/frontend-plugin-design-principles.md`
- `docs/deployment.md`
- `docs/runbooks.md`
- `demo.md`
