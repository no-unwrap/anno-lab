"""Django management command to validate all registered frontend plugins."""
import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from core.models import FrontendPlugin
from core.plugin_validation import validate_plugin_manifest


class Command(BaseCommand):
    help = 'Validate all registered frontend plugin manifests against filesystem'

    def add_arguments(self, parser):
        parser.add_argument(
            '--fix',
            action='store_true',
            help='Attempt to fix validation errors by updating manifest from filesystem',
        )
        parser.add_argument(
            '--strict',
            action='store_true',
            help='Exit with error code if any validation fails',
        )

    def handle(self, *args, **options):
        fix_mode = options['fix']
        strict_mode = options['strict']

        plugins = FrontendPlugin.objects.select_related('task_type').all()

        if not plugins.exists():
            self.stdout.write(self.style.WARNING('No plugins registered.'))
            return

        self.stdout.write(f'Validating {plugins.count()} plugin(s)...\n')

        errors = []
        warnings = []

        for plugin in plugins:
            status = '✓' if plugin.is_active else '○'
            self.stdout.write(f'{status} {plugin.task_type.slug} (v{plugin.version})')

            try:
                # Validate manifest structure
                validated = validate_plugin_manifest(plugin.manifest)

                # Check if manifest root exists on filesystem
                frontends_dir = Path(__file__).resolve().parents[4] / 'frontends'
                plugin_root = plugin.manifest.get('root', '')
                root_path = frontends_dir / plugin_root

                if not root_path.exists():
                    msg = f'  ERROR: Plugin root not found: {root_path}'
                    self.stdout.write(self.style.ERROR(msg))
                    errors.append((plugin, f'Root path missing: {plugin_root}'))
                    continue

                # Check if all declared assets exist
                missing_assets = []
                for asset_type in ['js', 'css']:
                    asset_list = validated.get(asset_type, [])
                    for asset_path in asset_list:
                        full_asset_path = root_path / asset_path
                        if not full_asset_path.exists():
                            missing_assets.append(asset_path)

                if missing_assets:
                    msg = f'  ERROR: Missing assets: {", ".join(missing_assets)}'
                    self.stdout.write(self.style.ERROR(msg))
                    errors.append((plugin, f'Missing assets: {missing_assets}'))
                    continue

                # Check if filesystem has a manifest.json
                manifest_file = root_path.parent / 'manifest.json'
                if not manifest_file.exists():
                    msg = f'  WARNING: No manifest.json file found at {manifest_file}'
                    self.stdout.write(self.style.WARNING(msg))
                    warnings.append((plugin, 'No manifest.json on filesystem'))
                else:
                    # Compare DB manifest with filesystem manifest
                    with open(manifest_file, 'r') as f:
                        fs_manifest = json.load(f)

                    if fs_manifest != plugin.manifest:
                        msg = '  WARNING: DB manifest differs from filesystem'
                        self.stdout.write(self.style.WARNING(msg))
                        warnings.append((plugin, 'Manifest mismatch'))

                        if fix_mode:
                            plugin.manifest = fs_manifest
                            plugin.save()
                            self.stdout.write(self.style.SUCCESS('  FIXED: Updated from filesystem'))

                if not missing_assets:
                    self.stdout.write(self.style.SUCCESS('  OK'))

            except Exception as e:
                msg = f'  ERROR: Validation failed: {str(e)}'
                self.stdout.write(self.style.ERROR(msg))
                errors.append((plugin, str(e)))

        # Summary
        self.stdout.write('\n' + '=' * 60)
        if errors:
            self.stdout.write(self.style.ERROR(f'ERRORS: {len(errors)}'))
            for plugin, error in errors:
                self.stdout.write(f'  - {plugin.task_type.slug}: {error}')

        if warnings:
            self.stdout.write(self.style.WARNING(f'WARNINGS: {len(warnings)}'))
            for plugin, warning in warnings:
                self.stdout.write(f'  - {plugin.task_type.slug}: {warning}')

        if not errors and not warnings:
            self.stdout.write(self.style.SUCCESS('All plugins valid!'))

        if strict_mode and errors:
            raise CommandError(f'{len(errors)} plugin(s) failed validation')
