"""
anno-lab command-line interface

Provides convenience commands for project initialization, plugin management,
and deployment operations.
"""
import json
import os
import sys

import click
import django


def setup_django():
    """Initialize Django settings."""
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'anno_lab.settings')
    django.setup()


@click.group()
@click.version_option(version='0.1.0')
def main():
    """anno-lab: Human-in-the-loop annotation platform"""
    pass


@main.command()
@click.option('--name', prompt='Project name', help='Human-readable project name')
@click.option('--slug', prompt='Project slug', help='URL-safe project identifier')
def init_project(name, slug):
    """Initialize a new annotation project."""
    setup_django()
    from core.models import Project

    project, created = Project.objects.get_or_create(
        slug=slug,
        defaults={'name': name}
    )

    if created:
        click.echo(f"✓ Created project: {name} ({slug})")
    else:
        click.echo(f"! Project already exists: {name} ({slug})")

    click.echo(f"\nProject ID: {project.id}")
    click.echo(f"API URL: /api/projects/{project.id}/")


@main.command()
@click.option('--strict', is_flag=True, help='Exit with error if validation fails')
def validate_plugins(strict):
    """Validate all registered frontend plugins."""
    setup_django()
    from django.core.management import call_command

    try:
        args = ['validate_plugins']
        if strict:
            args.append('--strict')
        call_command(*args)
    except Exception as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)


@main.command()
@click.argument('plugin_dir', type=click.Path(exists=True))
@click.option('--task-type', required=True, help='TaskType slug')
def register_plugin(plugin_dir, task_type):
    """Register a frontend plugin from a directory."""
    setup_django()
    from pathlib import Path

    from core.models import FrontendPlugin, TaskType
    from core.plugin_validation import validate_plugin_manifest
    from django.core.exceptions import ValidationError as DjangoValidationError

    manifest_path = Path(plugin_dir) / 'manifest.json'
    if not manifest_path.exists():
        click.echo(f"Error: No manifest.json found in {plugin_dir}", err=True)
        sys.exit(1)

    with open(manifest_path) as f:
        manifest = json.load(f)

    try:
        task_type_obj = TaskType.objects.get(slug=task_type)
    except TaskType.DoesNotExist:
        click.echo(f"Error: TaskType '{task_type}' not found", err=True)
        click.echo("Create it first with: python manage.py shell")
        sys.exit(1)

    try:
        manifest = validate_plugin_manifest(manifest)
    except DjangoValidationError as exc:
        click.echo(f"Error: {' '.join(exc.messages)}", err=True)
        sys.exit(1)

    manifest_task_type = manifest.get('task_type')
    if manifest_task_type != task_type_obj.slug:
        click.echo(
            (
                "Error: Manifest task_type "
                f"({manifest_task_type}) does not match plugin task_type "
                f"({task_type_obj.slug})."
            ),
            err=True,
        )
        sys.exit(1)

    plugin, created = FrontendPlugin.objects.update_or_create(
        task_type=task_type_obj,
        defaults={
            'name': manifest.get('name'),
            'version': manifest.get('version'),
            'manifest': manifest,
            'is_active': True,
        }
    )

    action = "Registered" if created else "Updated"
    click.echo(f"✓ {action} plugin: {plugin.name} v{plugin.version}")


@main.command(name='export-project-data')
@click.argument('project_slug')
@click.option('--output', type=click.Path(), help='Output file (default: stdout)')
def export_project_data(project_slug, output):
    """Export raw project collection data."""
    _export_project_data(project_slug, output)


def _export_project_data(project_slug, output):
    setup_django()

    from core.exports import ExportError, render_project_export
    from core.models import Project

    try:
        project = Project.objects.get(slug=project_slug)
    except Project.DoesNotExist:
        click.echo(f"Error: Project '{project_slug}' not found", err=True)
        sys.exit(1)

    try:
        content, _, _ = render_project_export(project, 'json')
    except ExportError as exc:
        click.echo(f"Error: {exc}", err=True)
        sys.exit(1)

    if output:
        with open(output, 'w', encoding='utf-8') as f:
            f.write(content)
        click.echo(f"✓ Exported raw collection data for project '{project.slug}' to {output}")
    else:
        click.echo(content)


@main.command()
@click.option('--limit', default=25, help='Maximum number of HITs to sync')
def sync_mturk(limit):
    """Sync open MTurk HITs and ingest submitted assignments."""
    setup_django()
    from core.mturk import ingest_submitted_assignments, sync_open_hits

    click.echo("Syncing open MTurk HITs...")
    hit_result = sync_open_hits(limit=limit)
    click.echo(f"  Synced {hit_result.get('hits', 0)} HITs")

    click.echo("\nIngesting submitted assignments...")
    ingest_result = ingest_submitted_assignments(limit=limit)
    click.echo(f"  Ingested {ingest_result.get('ingested', 0)} assignments")


@main.command()
@click.option('--reset', is_flag=True, help='Clear existing data before loading')
@click.option('--skip-confirmation', is_flag=True, help='Skip confirmation prompt when using --reset')
def load_examples(reset, skip_confirmation):
    """Load example dataset fixtures for demonstration and testing."""
    setup_django()
    from django.core.management import call_command

    args = ['load_examples']
    if reset:
        args.append('--reset')
    if skip_confirmation:
        args.append('--skip-confirmation')

    try:
        call_command(*args)
    except Exception as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)


@main.command(name='import-salient-tbi-seeds')
@click.argument('artifact', type=click.Path(exists=True))
@click.option('--dry-run', is_flag=True, help='Validate the artifact without writing task payloads')
@click.option(
    '--overwrite-stale',
    is_flag=True,
    help='Overwrite only existing seeds with stale provider/checkpoint provenance',
)
@click.option(
    '--overwrite-existing',
    is_flag=True,
    help='Overwrite any existing pre_annotations payload for the targeted tasks',
)
def import_salient_tbi_seeds(artifact, dry_run, overwrite_stale, overwrite_existing):
    """Import offline salient_tbi seed proposals into Task.payload.pre_annotations."""
    setup_django()
    from django.core.management import call_command

    args = ['import_salient_tbi_seeds', artifact]
    if dry_run:
        args.append('--dry-run')
    if overwrite_stale:
        args.append('--overwrite-stale')
    if overwrite_existing:
        args.append('--overwrite-existing')

    try:
        call_command(*args)
    except Exception as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)


if __name__ == '__main__':
    main()
