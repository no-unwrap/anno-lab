from __future__ import annotations

import json
from pathlib import Path


def test_plugin_guide_vite_example_matches_reference_plugin() -> None:
    package_json = json.loads(
        Path("frontends/salient-poly/package.json").read_text(encoding="utf-8")
    )
    vite_version = package_json["devDependencies"]["vite"]
    plugin_guide = Path("docs/plugin-guide.md").read_text(encoding="utf-8")

    assert f'"vite": "{vite_version}"' in plugin_guide


def test_plugin_guide_annotate_route_matches_backend() -> None:
    plugin_guide = Path("docs/plugin-guide.md").read_text(encoding="utf-8")

    assert "/api/tasks/{task_id}/annotate/" in plugin_guide
    assert "/annotate/tasks/{task_id}/" not in plugin_guide


def test_plugin_guide_closes_legacy_salient_poly_result_object_surface() -> None:
    plugin_guide = Path("docs/plugin-guide.md").read_text(encoding="utf-8")

    assert '`schema_version: "2.0.0"` with `result.objects[]`' in plugin_guide
    assert "`result.object` shape is treated as historical data only" in plugin_guide
    assert "do not ship a compatibility shim" in plugin_guide


def test_plugin_guide_documents_read_boot_config_as_shared_helper() -> None:
    plugin_guide = Path("docs/plugin-guide.md").read_text(encoding="utf-8")

    assert "`readBootConfig`, `useTaskBundle`, and `useAnnotationSubmit`" in plugin_guide
    assert "`readBootConfig` from `@anno-lab/shared` as the preferred boot-parsing API" in plugin_guide
    assert "const boot = readBootConfig();" in plugin_guide


def test_public_docs_index_current_technical_guidance() -> None:
    expected_refs = (
        "docs/plugin-guide.md",
        "docs/frontend-plugin-design-principles.md",
        "docs/deployment.md",
        "docs/runbooks.md",
        "demo.md",
    )

    for relative_path in ("README.md", "docs/README.md"):
        content = Path(relative_path).read_text(encoding="utf-8")
        for expected_ref in expected_refs:
            assert expected_ref in content


def test_frontend_plugin_design_principles_doc_is_indexed_and_concrete() -> None:
    for relative_path in ("README.md", "docs/README.md", "docs/plugin-guide.md", "demo.md"):
        content = Path(relative_path).read_text(encoding="utf-8")
        assert "docs/frontend-plugin-design-principles.md" in content

    principles = Path("docs/frontend-plugin-design-principles.md").read_text(encoding="utf-8")
    assert "Persistent Workspace Shell" in principles
    assert "selection stays synchronized between canvas and rails" in principles
    assert "The second real plugin should prove this shared-shell model" in principles
    assert "same product family" in principles


def test_deployment_and_architecture_docs_match_dockerfile_frontend_copy_policy() -> None:
    dockerfile = Path("Dockerfile").read_text(encoding="utf-8")
    deployment = Path("docs/deployment.md").read_text(encoding="utf-8")
    architecture = Path("docs/architecture.md").read_text(encoding="utf-8")

    assert "COPY frontends /app/frontends" in dockerfile
    assert "local-filesystem plugin asset serving works by default" in deployment
    assert "COPY frontends /app/frontends" in architecture


def test_backend_test_readme_matches_pytest_surface() -> None:
    content = Path("backend/core/TEST_README.md").read_text(encoding="utf-8")

    assert "PYTHONPATH=backend python -m pytest -q" in content
    assert "backend/anno_lab/test_settings.py" in content
    assert "just test" in content
    assert "test_docs_consistency.py" in content
