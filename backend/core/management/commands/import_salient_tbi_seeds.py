from __future__ import annotations

from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from core.salient_tbi_seed_import import (
    SeedImportError,
    import_salient_tbi_seed_batch,
    load_salient_tbi_seed_batch,
)


class Command(BaseCommand):
    help = (
        "Import offline salient_tbi seed proposals into Task.payload.pre_annotations."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "artifact",
            type=Path,
            help="Path to a salient_tbi seed proposal artifact JSON file.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Validate the artifact and report what would change without writing task payloads.",
        )
        parser.add_argument(
            "--overwrite-stale",
            action="store_true",
            help="Overwrite only existing seeds whose stored provider/checkpoint provenance is stale.",
        )
        parser.add_argument(
            "--overwrite-existing",
            action="store_true",
            help="Overwrite any existing pre_annotations payload for the targeted tasks.",
        )

    def handle(self, *args, **options):
        artifact_path: Path = options["artifact"]
        dry_run = options["dry_run"]
        overwrite_stale = options["overwrite_stale"]
        overwrite_existing = options["overwrite_existing"]

        try:
            batch = load_salient_tbi_seed_batch(artifact_path)
            summary = import_salient_tbi_seed_batch(
                batch,
                dry_run=dry_run,
                overwrite_stale=overwrite_stale,
                overwrite_existing=overwrite_existing,
            )
        except (OSError, ValueError, SeedImportError) as exc:
            raise CommandError(str(exc)) from exc

        self.stdout.write(
            self.style.SUCCESS(
                f"Processed {summary.proposals_seen} salient_tbi seed proposal(s)."
            )
        )
        self.stdout.write(f"  Created: {summary.created}")
        self.stdout.write(f"  Updated: {summary.updated}")
        self.stdout.write(f"  Skipped existing: {summary.skipped_existing}")
        self.stdout.write(f"  Skipped stale: {summary.skipped_stale}")
        self.stdout.write(f"  Skipped missing task: {summary.skipped_missing_task}")
        self.stdout.write(
            f"  Skipped wrong task type: {summary.skipped_wrong_task_type}"
        )
        self.stdout.write(
            f"  Skipped missing asset dimensions: {summary.skipped_missing_asset_dimensions}"
        )
        self.stdout.write(
            f"  Skipped invalid polygon: {summary.skipped_invalid_polygon}"
        )

        if dry_run:
            self.stdout.write(self.style.WARNING("Dry run only: no task payloads were written."))
