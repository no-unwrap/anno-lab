import json
import mimetypes
from pathlib import Path

from django.conf import settings
from django.http import Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.utils.html import escape

from .models import Task, TaskType
from .plugin_validation import is_within_root

FRONTENDS_DIR = Path(__file__).resolve().parent.parent.parent / "frontends"
_INLINE_SCRIPT_JSON_ESCAPES = {
    ord("<"): "\\u003C",
    ord(">"): "\\u003E",
    ord("&"): "\\u0026",
}


def _render_plugin_asset_tags(task_id: int, manifest: dict) -> tuple[str, str]:
    css_files = manifest.get("css", [])
    js_files = manifest.get("js", [])

    css_tags = "\n".join(
        [
            '<link rel="stylesheet" href="{path}">'.format(
                path=escape(
                    reverse(
                        "plugin-asset",
                        kwargs={"task_id": task_id, "asset_path": asset_path},
                    )
                )
            )
            for asset_path in css_files
        ]
    )
    js_tags = "\n".join(
        [
            '<script type="module" src="{path}"></script>'.format(
                path=escape(
                    reverse(
                        "plugin-asset",
                        kwargs={"task_id": task_id, "asset_path": asset_path},
                    )
                )
            )
            for asset_path in js_files
        ]
    )
    return css_tags, js_tags


def _get_task_with_plugin(task_id: int) -> tuple[Task, TaskType, object]:
    task = get_object_or_404(
        Task.objects.select_related("task_definition__task_type"), pk=task_id
    )
    tt = task.task_definition.task_type
    plugin = getattr(tt, "plugin", None)
    return task, tt, plugin


def _inactive_plugin_response(task_type_slug: str) -> HttpResponse:
    return HttpResponse(
        f"<h3>No active plugin registered for task type: {escape(task_type_slug)}</h3>",
        status=404,
    )


def _render_plugin_shell(
    *,
    task_id: int,
    title: str,
    manifest: dict,
    boot: dict,
) -> HttpResponse:
    css_tags, js_tags = _render_plugin_asset_tags(task_id, manifest)
    safe_boot_json = json.dumps(boot).translate(_INLINE_SCRIPT_JSON_ESCAPES)

    html = f"""<!doctype html>
            <html>
            <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>{title}</title>
            {css_tags}
            </head>
            <body>
            <div id="root"></div>
            <script>
            window.__ANNO_LAB_BOOT__ = {safe_boot_json};
            </script>
            {js_tags}
            </body>
            </html>
        """
    return HttpResponse(html)


def annotate_task_shell(request, task_id: int):
    """Minimal HTML shell that loads a registered frontend plugin bundle."""
    task, tt, plugin = _get_task_with_plugin(task_id)
    if not plugin or not plugin.is_active:
        return _inactive_plugin_response(tt.slug)

    boot = {
        "taskId": task.id,
        "apiBase": "/api",
    }

    return _render_plugin_shell(
        task_id=task.id,
        title=f"Annotate #{task.id} — {escape(tt.slug)}",
        manifest=plugin.manifest or {},
        boot=boot,
    )


def plugin_asset(request, task_id: int, asset_path: str):
    task, tt, plugin = _get_task_with_plugin(task_id)
    if not plugin or not plugin.is_active:
        raise Http404("No active plugin")

    # Defense in depth: reject directory traversal attempts before path operations
    if ".." in asset_path or asset_path.startswith("/"):
        raise Http404("Invalid path")

    # Check if S3 plugin storage is enabled
    use_s3 = getattr(settings, "USE_S3_PLUGINS", False)

    if use_s3:
        import boto3
        from django.http import HttpResponseRedirect

        # Serve from S3
        s3_bucket = getattr(settings, "PLUGIN_S3_BUCKET", None) or getattr(
            settings, "S3_BUCKET", None
        )
        if not s3_bucket:
            raise Http404("S3 plugin storage not configured")

        # Construct S3 key
        task_type_slug = tt.slug
        plugin_version = plugin.version
        s3_key = f"plugins/{task_type_slug}/{plugin_version}/{asset_path}"

        # Generate presigned URL
        s3_client = boto3.client(
            "s3",
            region_name=getattr(settings, "AWS_REGION", "us-east-1"),
        )

        presigned_url = s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": s3_bucket, "Key": s3_key},
            ExpiresIn=3600,  # 1 hour
        )

        return HttpResponseRedirect(presigned_url)
    else:
        # Serve from local filesystem (dev mode)
        manifest = plugin.manifest or {}
        plugin_root = manifest.get("root", "")
        if not isinstance(plugin_root, str) or not plugin_root.strip():
            raise Http404("Invalid path")
        frontends_root = FRONTENDS_DIR.resolve()
        safe_root = (frontends_root / plugin_root).resolve()
        if not is_within_root(safe_root, frontends_root):
            raise Http404("Invalid path")
        safe_file = (safe_root / asset_path).resolve()

        if not is_within_root(safe_file, safe_root):
            raise Http404("Invalid path")
        if not safe_file.exists() or not safe_file.is_file():
            raise Http404("Missing asset")

        mime, _ = mimetypes.guess_type(str(safe_file))
        mime = mime or "application/octet-stream"
        return HttpResponse(safe_file.read_bytes(), content_type=mime)


def mturk_annotate_task(request, task_id: int):
    """MTurk-compatible wrapper.
    MTurk appends query params like assignmentId, hitId, workerId.
    We render the same plugin shell but provide `mturk` metadata so the plugin (or wrapper)
    can submit back to MTurk.
    """
    task, tt, plugin = _get_task_with_plugin(task_id)
    assignment_id = request.GET.get("assignmentId", "")
    hit_id = request.GET.get("hitId", "")
    worker_id = request.GET.get("workerId", "")
    sandbox = bool(getattr(settings, "MTURK_SANDBOX", True))

    # MTurk uses a fixed submit URL pattern.
    submit_host = (
        "https://www.mturk.com" if not sandbox else "https://workersandbox.mturk.com"
    )
    submit_url = f"{submit_host}/mturk/externalSubmit"

    if not plugin or not plugin.is_active:
        return _inactive_plugin_response(tt.slug)

    boot = {
        "taskId": task.id,
        "apiBase": "/api",
        "mturk": {
            "assignmentId": assignment_id,
            "hitId": hit_id,
            "workerId": worker_id,
            "sandbox": sandbox,
            "submitUrl": submit_url,
        },
    }

    return _render_plugin_shell(
        task_id=task.id,
        title=f"MTurk Annotate #{task.id} — {escape(tt.slug)}",
        manifest=plugin.manifest or {},
        boot=boot,
    )
