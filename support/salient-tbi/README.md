# Salient TBI Offline Seed Proposal Support Surface

This support surface defines the offline artifact contract for `AL-ENG-05b`.

Operational split:
- cluster step: run SAM-based inference offline and emit bounded proposal artifacts
- anno-lab step: import those artifacts through `python backend/manage.py import_salient_tbi_seeds ...`

This tranche is intentionally offline-only:
- no browser-to-cluster communication
- no MTurk-facing inference
- no Django request-time model calls

## Pilot defaults

- task type: `salient_tbi`
- provider: `sam2.1`
- checkpoint: `sam2.1-hiera-small`
- one top proposal per task
- largest connected component only
- single exterior polygon only
- no holes
- clamp to image bounds
- deterministic Douglas-Peucker-style simplification
- hard vertex cap enforced during import
- overwrite disabled by default

## Artifact format

Emit JSON matching [proposal-batch.schema.json](proposal-batch.schema.json).

Minimal shape:

```json
{
  "schema_version": "1.0.0",
  "task_type": "salient_tbi",
  "provider": "sam2.1",
  "checkpoint": "sam2.1-hiera-small",
  "run_id": "pilot-run-001",
  "proposals": [
    {
      "task_id": 123,
      "proposal_id": "proposal-123",
      "score": 0.91,
      "polygon": [
        { "x": 100.0, "y": 140.0 },
        { "x": 300.0, "y": 150.0 },
        { "x": 260.0, "y": 360.0 }
      ]
    }
  ]
}
```

The importer treats the artifact as untrusted operator input and re-validates:
- schema version
- task type
- provider/checkpoint presence
- one proposal per task
- polygon finiteness
- clamping
- simplification
- vertex cap
- degenerate fail-close behavior

## Writeback

The trusted writeback path is:

```bash
python backend/manage.py import_salient_tbi_seeds /path/to/proposal-batch.json
```

Useful modes:
- `--dry-run`
- `--overwrite-stale`
- `--overwrite-existing`

Default overwrite is off.
