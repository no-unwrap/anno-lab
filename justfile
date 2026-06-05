set shell := ["bash", "-euo", "pipefail", "-c"]

setup:
	@echo "Python dependencies are provided by the declarative workstation; no repo-local pip install step is required."
	@echo "python --version"
	python --version

django-check:
	@echo "python backend/manage.py check"
	python backend/manage.py check

lint:
	@echo "PYTHONPATH=backend python -m ruff check backend"
	PYTHONPATH=backend python -m ruff check backend

refactor-complexity:
	@echo "python -m radon cc backend/core backend/anno_lab -s -a"
	python -m radon cc backend/core backend/anno_lab -s -a

test:
	@echo "PYTHONPATH=backend python -m pytest -q"
	PYTHONPATH=backend python -m pytest -q

validate-plugins:
	@echo "python backend/manage.py validate_plugins --strict"
	python backend/manage.py validate_plugins --strict

frontend-build:
	@echo "npm --prefix frontends/salient-poly run build"
	npm --prefix frontends/salient-poly run build
	@echo "npm --prefix frontends/instance-bbox run build"
	npm --prefix frontends/instance-bbox run build
	@echo "npm --prefix frontends/pose-keypoints run build"
	npm --prefix frontends/pose-keypoints run build

frontend-lint:
	@echo "npm --prefix frontends/salient-poly run lint"
	npm --prefix frontends/salient-poly run lint
	@echo "npm --prefix frontends/instance-bbox run lint"
	npm --prefix frontends/instance-bbox run lint
	@echo "npm --prefix frontends/pose-keypoints run lint"
	npm --prefix frontends/pose-keypoints run lint

frontend-typecheck:
	@echo "npm --prefix frontends/salient-poly run typecheck"
	npm --prefix frontends/salient-poly run typecheck
	@echo "npm --prefix frontends/instance-bbox run typecheck"
	npm --prefix frontends/instance-bbox run typecheck
	@echo "npm --prefix frontends/pose-keypoints run typecheck"
	npm --prefix frontends/pose-keypoints run typecheck

frontend-test:
	@echo "npm --prefix frontends/salient-poly run test"
	npm --prefix frontends/salient-poly run test
	@echo "npm --prefix frontends/instance-bbox run test"
	npm --prefix frontends/instance-bbox run test
	@echo "npm --prefix frontends/pose-keypoints run test"
	npm --prefix frontends/pose-keypoints run test

refactor-frontend-unused:
	@echo "npm --prefix frontends/salient-poly run refactor:unused"
	npm --prefix frontends/salient-poly run refactor:unused
	@echo "npm --prefix frontends/instance-bbox run refactor:unused"
	npm --prefix frontends/instance-bbox run refactor:unused
	@echo "npm --prefix frontends/pose-keypoints run refactor:unused"
	npm --prefix frontends/pose-keypoints run refactor:unused

load-examples:
	@echo "python backend/manage.py load_examples"
	python backend/manage.py load_examples

smoke:
	@echo "python backend/manage.py check"
	python backend/manage.py check
	@echo "PYTHONPATH=backend python -m pytest -q backend/core/tests"
	PYTHONPATH=backend python -m pytest -q backend/core/tests
