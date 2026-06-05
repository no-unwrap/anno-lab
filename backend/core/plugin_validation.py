from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, List

from django.conf import settings
from django.core.exceptions import ValidationError

FRONTENDS_ROOT = (settings.BASE_DIR.parent / "frontends").resolve()
REQUIRED_KEYS = {"name", "task_type", "version", "root", "js", "result_schema_version"}


def _require_list(manifest: Dict[str, Any], key: str) -> List[str]:
    value = manifest.get(key) or []
    if not isinstance(value, list):
        raise ValidationError(f"Manifest field '{key}' must be a list.")
    for item in value:
        if not isinstance(item, str):
            raise ValidationError(f"Manifest field '{key}' items must be strings.")
    return value


def is_within_root(path: Path, root: Path) -> bool:
    return path.is_relative_to(root)


def _safe_path(root: Path, relative_path: str) -> Path:
    safe = (root / relative_path).resolve()
    if not is_within_root(safe, root):
        raise ValidationError(f"Manifest path '{relative_path}' escapes plugin root.")
    return safe


def validate_plugin_manifest(manifest: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(manifest, dict):
        raise ValidationError("Manifest must be a JSON object.")

    missing = REQUIRED_KEYS - manifest.keys()
    if missing:
        raise ValidationError(
            f"Manifest missing required fields: {', '.join(sorted(missing))}."
        )

    root = manifest.get("root") or ""
    if not isinstance(root, str) or not root.strip():
        raise ValidationError("Manifest field 'root' is required.")
    if os.path.isabs(root) or ".." in Path(root).parts:
        raise ValidationError(
            "Manifest field 'root' must be a relative path within /frontends."
        )

    plugin_root = _safe_path(FRONTENDS_ROOT, root)
    if not plugin_root.exists():
        raise ValidationError(
            f"Manifest root '{root}' does not exist in {FRONTENDS_ROOT}."
        )

    js_files = _require_list(manifest, "js")
    css_files = _require_list(manifest, "css")

    for rel_path in js_files + css_files:
        if not rel_path.strip():
            raise ValidationError("Manifest asset paths cannot be empty.")
        asset_path = _safe_path(plugin_root, rel_path)
        if not asset_path.exists():
            raise ValidationError(
                f"Manifest asset '{rel_path}' not found under {plugin_root}."
            )

    schema_version = manifest.get("result_schema_version")
    if not isinstance(schema_version, str) or not schema_version.strip():
        raise ValidationError(
            "Manifest field 'result_schema_version' must be a string."
        )

    # Return sanitized copy to avoid accidental mutation.
    sanitized: Dict[str, Any] = {
        "name": str(manifest.get("name", "")).strip(),
        "task_type": manifest["task_type"],
        "version": str(manifest.get("version", "")).strip(),
        "root": root,
        "js": js_files,
        "css": css_files,
        "result_schema_version": schema_version,
    }
    for key, value in manifest.items():
        if key not in sanitized:
            sanitized[key] = value
    return sanitized
