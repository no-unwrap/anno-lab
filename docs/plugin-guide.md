# Annotation Frontend Plugin Development Guide

This guide explains how to build annotation frontend plugins for the anno-lab (Human-in-the-Loop) system. We use the **salient-poly** plugin as a reference example throughout.

## Overview

Annotation plugins are self-contained frontend applications that handle human annotation of media assets (images, video frames, etc.). Each plugin:
- Renders an interactive interface for a specific annotation task type
- Receives asset data via a standardized API
- Submits annotations back to the backend
- Operates independently within the anno-lab platform

Implementation focus:
- keep plugins task-specific instead of collapsing disciplines into one universal annotator
- extract only small shared React primitives once at least two real plugins prove the reuse
- treat accessibility and user-friendliness as core plugin requirements, not post-hoc polish
- keep dataset-format conversion, data cleaning, dataset analysis, and model evaluation out of plugin code so the repo stays centered on annotation capture, provenance, and plugin delivery
- use `docs/frontend-plugin-design-principles.md` for the shared shell and interaction rules that plugins should inherit
- keep plugins aligned to one shared interaction language so they feel like one product family across tasks
- keep shared primitives in `frontends/shared/` and task-specific bundles in plugin directories such as `frontends/salient-poly/`, `frontends/salient-tbi/`, `frontends/instance-bbox/`, and `frontends/pose-keypoints/`

### Plugin Design Standards

Plugins should aim for:
- keyboard-operable primary workflows
- visible focus and clear interaction state
- non-color-only status and selection cues
- predictable undo and redo for high-cost actions
- explicit validation and submission feedback

Plugins should not feel like separate products. Across tasks, preserve:
- common shell regions and control placement
- common panel and feedback behavior
- common hotkey philosophy
- common visual state treatment for selection, success, warning, and destructive actions
- a standardized desktop workspace envelope that keeps the annotation stage, primary controls, and status surfaces inside one supported viewport when practical

Shared frontend code should stay small and infrastructure-like. Good candidates for a future shared toolkit are boot parsing, task-bundle loading, submission helpers, geometry transforms, fit-coordinate helpers, shared precision aids, history helpers, and common status UI. Keep task semantics and result-shape logic inside each plugin.

### Plugin Naming Convention

Treat the backend `TaskType.slug` as the canonical plugin identity, then mirror it consistently:
- use `snake_case` for the backend task type, for example `salient_poly` or `instance_bbox`
- use the kebab-case equivalent for the frontend directory, package name, manifest root, and `tool_version` prefix, for example `salient-poly` or `instance-bbox`
- prefer `problem-space + annotation primitive` over dataset-specific names or UI-internal names

Recommended pattern:
- backend task type: `<problem_space>_<annotation_primitive>`
- frontend plugin id: `<problem-space>-<annotation-primitive>`

Examples:
- `salient_poly` -> `salient-poly`
- `instance_bbox` -> `instance-bbox`
- `pose_keypoints` -> `pose-keypoints`
- `track_bbox` -> `track-bbox`

Use the prefix for semantics that change the result contract, and the suffix for the primary annotation primitive. Keep ontology, class lists, and dataset-specific instructions in `TaskDefinition`, not in the plugin name.

### Workspace Design Principles

For spatial annotation tasks, prefer a persistent workspace shell over one-off page layouts:
- a stable central workspace for the image and annotation surface
- optional left and right rails for dataset navigation and annotation details
- visible precision controls for magnifier state and level selection
- a persistent status or progress surface instead of hiding all state in dialogs
- on supported desktop widths, keep the shell inside one viewport by letting rails and dense control rows scroll internally before the document scrolls

The shell should be recognizable across plugins. A user moving from one task plugin to another should feel like they changed tools inside one product, not that they entered a new application.

Current stock direction for the live spatial plugins:
- keep the image fitted to the workspace
- do not expose stock zoom and pan controls
- use the shared magnifier and crosshair guides for precise inspection work

Mirror interaction state across the workspace:
- selection in the canvas should be reflected in side-panel lists
- list hover or selection should be reflected back in the canvas where practical
- completion and warning state should be visible both in the workspace and in navigation surfaces

Context matters:
- editor hotkeys should only fire in the editor context, not while typing in text inputs or dialogs
- dialogs and toasts should be centralized rather than reimplemented inside each plugin
- large image or annotation collections should use virtualization or equivalent scalable rendering
- unsupported small-screen states should fail closed with a clear operator-facing explanation instead of degrading silently

### Shared Frontend Boundary

The shared frontend layer should stay small.

Current shared exports under `frontends/shared/` are:
- `WorkspaceShell`, `PanelSection`, `StatusFooter`, `ToastRegion`, and `EmptyState` for shell and feedback layout
- `readBootConfig`, `useTaskBundle`, and `useAnnotationSubmit` for boot parsing and backend contract integration
- `useHotkeys`, `useSelectionSync`, `useImageStageMetrics`, geometry helpers, and fit-coordinate helpers for shared interaction plumbing
- `HoverMagnifier`, `StageCrosshair`, `useHoverMagnifier`, and the magnifier-level helpers for the shared hover-inspection surface now used by `salient-poly`, `salient-tbi`, `instance-bbox`, and `pose-keypoints`; the stock shared behavior is an image-only `3x` lens with top-left-preferred placement, edge-aware fallback, and shared `1.5x`, `3x`, and `5x` levels

Shared candidates, only when real reuse pressure proves the shape, are:
- `useUndoHistory`
- a bounded `PrecisionControls` cluster for the magnifier toggle and level buttons once the visible contract is explicit enough for direct shared tests
- `DialogLayer` and scalable list primitives

Keep these plugin-specific:
- geometry editing logic
- dataset navigation, richer rail composition, and task-shaped collection workflows
- lightweight pre-submit review helpers unless multiple live plugins prove the same visible contract
- task instructions and task-definition semantics
- result JSON shape
- validation rules that belong to a specific annotation discipline

Current shared-control boundary:
- the fit-first workspace decision superseded the old shared `ViewportControls` question
- the shared surface today is the magnifier, the level helpers, the crosshair guides, and the fit-coordinate plumbing under them
- keep overlay-aware magnifier behavior out of the shared layer unless multiple live plugins require the same stable contract
- keep mode ownership, history buttons, annotation actions, task-specific disabled-state rules, and toolbar adjacency local unless a smaller shared `PrecisionControls` contract is directly justified
- the shared shell standardizes the desktop workspace envelope and toolbar grouping across the live plugins without extracting task-specific controls into `frontends/shared/`

This is the core structure:
- shared shell and interaction language in common code
- task mechanics and annotation semantics in the plugin
- raw export and provenance in the backend runtime

### Refactoring Mature Plugins

As plugins gain editing depth, prefer plugin-local decomposition before any new shared extraction.

Recommended seam order:
- pure geometry or annotation operations
- editor state or reducer logic
- pointer and keyboard interaction hooks
- presentational canvas, rail, and detail components

Keep these rules in place while refactoring:
- do not widen `frontends/shared/` just to remove repetition from one plugin
- do not change a plugin manifest, result schema, or task-definition contract unless the runtime contract actually changes
- keep accessibility behavior stable while splitting code, including keyboard paths, visible focus, and non-color-only cues
- grow tests at the same seams you extract: pure helper tests for geometry or editor operations, plus thin integration coverage for shell loading, submission, and critical annotation flows

Specific guidance for the current plugins:
- keep `salient-poly` as one plugin for now; the stock plugin is always multi-object unless workflows materially diverge enough to justify a separate contract
- `instance-bbox` now also proves plugin-local undo/redo for box creation, label changes, delete, committed move or resize refinement, and `Escape` drag cancellation on top of `bboxState.ts`; keep that history local to the plugin instead of widening `frontends/shared/`
- `pose-keypoints` now proves plugin-local undo/redo for landmark placement, visibility changes, clear, committed drag refinement, and drag cancellation on top of its reducer seam; keep that history local to the plugin instead of widening `frontends/shared/`
- `salient-poly` now proves plugin-local undo/redo, polygon reordering, point insertion/removal, and fit-first polygon editing on top of its landed local seams; keep any broader shared extraction gated until multiple plugins ask for the same implementation-ready control
- treat shared controls such as `PrecisionControls`, `useUndoHistory`, dialog infrastructure, and scalable list primitives as gated until multiple plugins need the same stable contract

---

## 1. Plugin Structure

### Directory Layout

Plugins live in the `/frontends` directory of the project:

```
frontends/
  shared/
    src/                       # Small cross-plugin shell, hooks, and geometry helpers
  salient-poly/              # Your plugin name
    dist/                    # Built output (auto-generated)
      assets/
        index.js
        index.css
    src/
      main.tsx              # Entry point
      App.tsx               # Main component
      styles.css
    index.html              # Template for Vite
    manifest.json           # Plugin metadata
    package.json            # NPM configuration
    vite.config.ts          # Build configuration
    tsconfig.json
  instance-bbox/           # First instance-bbox plugin using the shared layer
```

`frontends/shared/` is the preferred location for small cross-plugin infrastructure such as shell
layout, boot parsing, task-bundle loading, submission helpers, selection sync, and geometry
transforms. Keep task semantics and result-shape logic inside each plugin bundle.

### Manifest.json Requirements

The `manifest.json` file declares your plugin to the backend system:

```json
{
  "name": "Salient Polygon Annotator",
  "task_type": "salient_poly",
  "version": "0.2.7",
  "root": "salient-poly/dist",
  "css": ["assets/index.css"],
  "js": ["assets/index.js"],
  "result_schema_version": "2.0.0"
}
```

**Required Fields:**

- **`name`** (string): Human-readable plugin name
- **`task_type`** (string): Unique identifier matching a `TaskType` in the database
  - Must be lowercase with underscores (e.g., `salient_poly`, `instance_bbox`)
  - Referenced when creating `TaskDefinition` objects
- **`version`** (string): Semantic version (e.g., `0.1.0`, `1.2.3`)
  - Bumped when deploying plugin updates
- **`root`** (string): Relative path to built artifacts from `/frontends`
  - Typically `"{plugin-name}/dist"`
  - Must be a relative path, no `..` or absolute paths
- **`js`** (array): JavaScript asset files relative to `root`
  - Typically `["assets/index.js"]` for single-entry Vite builds
  - Supports multiple files if code-split by Vite
- **`css`** (array): CSS asset files relative to `root`
  - Typically `["assets/index.css"]` for Vite builds
  - Can be empty if styles are bundled into JS
- **`result_schema_version`** (string): Version of your annotation result format
  - Used for backward compatibility when result schema changes
  - Recommend tracking alongside `version`

**Optional Fields:**

- Any additional custom metadata is preserved through validation

---

## 2. Frontend Contract: window.__ANNO_LAB_BOOT__

The backend injects a global object into the HTML that provides context:

```javascript
window.__ANNO_LAB_BOOT__ = {
  "taskId": 42,
  "apiBase": "/api",
  "mturk": {
    "assignmentId": "...",
    "hitId": "...",
    "workerId": "...",
    "sandbox": false,
    "submitUrl": "https://www.mturk.com/mturk/externalSubmit"
  }
}
```

`window.__ANNO_LAB_BOOT__` is the canonical shell contract. In plugin code, prefer
`readBootConfig` from `@anno-lab/shared` instead of hand-rolling boot parsing or probing
undocumented aliases.

```typescript
import { readBootConfig } from '@anno-lab/shared';

const boot = readBootConfig();
const taskId = boot.taskId;
const apiBase = boot.apiBase;
const mturk = boot.mturk;
```

The underlying wire format that `readBootConfig` reads still looks like:

```typescript
interface BootWindow extends Window {
  __ANNO_LAB_BOOT__?: Record<string, any>;
}

const bootWindow = window as BootWindow;
const bootConfig = bootWindow.__ANNO_LAB_BOOT__ ?? {};
```

**Best Practice:** Treat `window.__ANNO_LAB_BOOT__` as the stable shell contract, but treat
`readBootConfig` from `@anno-lab/shared` as the preferred boot-parsing API, then fetch the task
bundle from `{apiBase}/tasks/{taskId}/bundle/` for task media and task-definition data.

Current backend behavior:
- the stock annotate shell injects `taskId`, `apiBase`, and optional `mturk` metadata
- the stock annotate shell does not inject a write token into `window.__ANNO_LAB_BOOT__`
- the stock backend does not mint a short-lived `boot.writeToken`; trusted deployments that need one
  must add their own wrapper or token-delivery path

---

## 3. Required API Calls

### GET /api/tasks/{id}/bundle/

**Purpose:** Fetch all context needed to annotate a task in a single request.

**Response Example:**
```json
{
  "task": {
    "id": 42,
    "project": 1,
    "asset": 5,
    "task_definition": 3,
    "status": "pending",
    "priority": 1,
    "assigned_to": "",
    "payload": {},
    "created_at": "2025-01-15T10:30:00Z"
  },
  "asset": {
    "id": 5,
    "project": 1,
    "media_type": "image/jpeg",
    "s3_key": "uploads/photo.jpg",
    "sha256": "abc123...",
    "width": 1920,
    "height": 1080,
    "metadata": {},
    "created_at": "2025-01-14T09:00:00Z"
  },
  "asset_url": "https://signed.example.com/uploads/photo.jpg?X-Amz-Signature=...",
  "task_type": {
    "id": 2,
    "slug": "salient_poly",
    "name": "Salient Polygon",
    "description": "Trace salient objects with polygons"
  },
  "task_definition": {
    "id": 3,
    "task_type": 2,
    "version": "1.0",
    "definition": { /* custom task configuration */ },
    "created_at": "2025-01-10T08:00:00Z"
  },
  "plugin": {
    "name": "Salient Polygon Annotator",
    "task_type": "salient_poly",
    "version": "0.2.7",
    "root": "salient-poly/dist",
    "css": ["assets/index.css"],
    "js": ["assets/index.js"],
    "result_schema_version": "2.0.0"
  }
}
```

**Usage in Salient-poly:**
- The plugin extracts `task.id` to identify the task
- Uses `asset_url` as the browser-ready media URL supplied by the backend
- Stores `task_definition.definition` for task-specific rules
- Reads `task.payload` for optional per-task bootstrap data such as
  `pre_annotations`

### Task.payload Pre-Annotations

`Task.payload` is the bounded repo-local contract for optional model-assisted
starting annotations. `anno-lab` does not run inference itself; external
pipelines populate the payload before the task reaches the annotator.

Use this shape:

```json
{
  "pre_annotations": {
    "schema_version": "1.0.0",
    "predictions": [
      {
        "id": "prediction-1",
        "kind": "bbox",
        "label": "person",
        "score": 0.98,
        "bbox": {
          "x": 80,
          "y": 120,
          "width": 240,
          "height": 320
        }
      }
    ]
  }
}
```

Contract rules:
- `pre_annotations` is optional; plugins must still work when it is absent
- `schema_version` is currently `1.0.0`
- `predictions[]` is task-type-agnostic; each item declares its own `kind`
- supported `kind` values are:
  - `bbox`: `{ bbox: { x, y, width, height } }`
  - `polygon`: `{ points: [{ x, y }, ...] }`
  - `keypoints`: `{ keypoints: [{ id, label?, state?, point }] }`
- optional shared fields: `id`, `label`, `score`, and `metadata`
- plugins should ignore malformed or unsupported predictions rather than
  guessing at aliases
- `instance-bbox` now renders `kind: "bbox"` predictions as editable starting
  boxes; other plugins can add their own readers on the same contract later

Example multi-kind payload:

```json
{
  "pre_annotations": {
    "schema_version": "1.0.0",
    "predictions": [
      {
        "id": "bbox-1",
        "kind": "bbox",
        "label": "vehicle",
        "bbox": { "x": 400, "y": 260, "width": 320, "height": 200 }
      },
      {
        "id": "polygon-1",
        "kind": "polygon",
        "label": "bag",
        "points": [
          { "x": 128, "y": 144 },
          { "x": 196, "y": 148 },
          { "x": 210, "y": 212 }
        ]
      },
      {
        "id": "pose-1",
        "kind": "keypoints",
        "label": "Primary person",
        "keypoints": [
          {
            "id": "nose",
            "label": "Nose",
            "state": "visible",
            "point": { "x": 144, "y": 90 }
          },
          {
            "id": "pelvis",
            "label": "Pelvis",
            "state": "not_in_frame",
            "point": null
          }
        ]
      }
    ]
  }
}
```

---

### POST /api/annotations/

**Purpose:** Submit a completed annotation.

**Request Body Format:**
```json
{
  "task": 42,
  "result": {
    "objects": [
      {
        "id": "salient-object-1",
        "type": "polygon",
        "label": "salient_object",
        "points": [[100.5, 200.3], [150.2, 250.1], [120.0, 280.4]]
      }
    ]
  },
  "schema_version": "2.0.0",
  "tool_version": "salient-poly@0.2.7",
  "actor": "worker_123",
  "submission_id": "uuid-or-unique-id",
  "raw_payload": {
    "source": "salient-poly",
    "ui": {
      "closed": true,
      "num_points": 3
    }
  },
  "assignment": null
}
```

**Field Descriptions:**

- **`task`** (int, required): Task ID being annotated
- **`result`** (object, required): Your annotation result
  - Structure is task-type-specific
  - For salient-poly: `{ objects: [{ id: "...", type: "polygon", label: "...", points: [...] }] }`
- **`schema_version`** (string, required): Version of result format
  - Must match `result_schema_version` in manifest
  - Supports schema evolution without breaking old annotations
- **`tool_version`** (string, recommended): Full version of your plugin
- Format: `"{plugin-name}@{version}"` (e.g., `"salient-poly@0.2.7"`)
  - Aids debugging and reproducibility
- **`actor`** (string, optional): Identifier for the annotator
  - Can be worker ID, user email, "dev", etc.
  - Leave empty if anonymous
- **`submission_id`** (string, optional): Unique ID for this submission
  - Prevents double-submission bugs
  - Auto-generated as UUID if not provided
  - Backend deduplicates by (task, submission_id) pair
- **`raw_payload`** (object, optional): Additional metadata
  - Unstructured field for plugin-specific debug info
  - For salient-poly: UI state (object count, draft vertex count, selected polygon)
- **`assignment`** (int, optional): Assignment ID (for MTurk workflows)
  - Omit if not using MTurk integration

**Response Status Codes:**

- **201 Created**: New annotation successfully submitted
- **200 OK**: Duplicate submission (same task + submission_id)
  - Returns the existing annotation unchanged
  - Prevents errors from retry logic
- **400 Bad Request**: Validation error (missing required fields, invalid structure)

### Write-Token Constraint

When backend `WRITE_TOKEN` is non-empty, `POST /api/annotations/` requires the
`X-Anno-Lab-Write-Token` header. The stock annotate shell does not expose a write token in
`window.__ANNO_LAB_BOOT__`, and the stock backend intentionally does not mint a browser write
token for the public shell. Same-origin alone is not a trust boundary, and the stock backend does
not ship an authenticated annotator-session model. Public browser sessions should therefore remain
fail-closed unless an operator-owned authenticated wrapper or server-side submission path injects a
trusted `boot.writeToken` or submits on the browser's behalf. If your deployment is already
trusted at the network boundary, another safe option is to leave `WRITE_TOKEN` empty for that
environment.

Stock platform decision as of 2026-03-16:
- anno-lab does not support a trusted-browser-auth path in the stock backend when `WRITE_TOKEN` is
  non-empty.
- any deployment that injects `boot.writeToken` is an operator-owned custom integration, not a
  stock anno-lab feature
- reopening this would require a separate authenticated annotator trust model plus an explicit boot
  contract change; it is not a same-origin toggle

MTurk is the supported stock-shell exception: when `boot.mturk` is present and no trusted
`boot.writeToken` exists, the shared submission hook hands the canonical annotation envelope back
to MTurk through `submitUrl` instead of posting directly to `/api/annotations/`. MTurk answer
sync plus `ingest_submitted_assignments` then creates the durable `Annotation` row.

---

## 4. Annotation Submission Format

### Salient-poly Example

For new shared-layer plugins, prefer `useAnnotationSubmit` from `@anno-lab/shared` instead of
reimplementing manual `fetch` logic. The example below shows the wire format the hook sends for
direct API submissions.

The salient-poly plugin submits multi-polygon annotations:

```typescript
const payload = {
  task: resolvedTaskId,
  result: {
    objects: polygons.map((polygon) => ({
      id: polygon.id,
      type: "polygon",
      label: "salient_object",
      // Points stored in natural image pixels (not display pixels)
      points: polygon.points.map((pt) => [
        Number(pt.x.toFixed(2)),
        Number(pt.y.toFixed(2))
      ])
    }))
  },
  schema_version: "2.0.0",
  tool_version: "salient-poly@0.2.7",
  actor: "dev",
  submission_id: crypto.randomUUID(),
  raw_payload: {
    source: "salient-poly",
    ui: {
      object_count: polygons.length,
      draft_vertex_count: 0,
      selected_polygon_id: polygons[0]?.id ?? null,
    }
  }
};

const response = await fetch("/api/annotations/", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-CSRFToken": getCsrfToken()  // See CSRF section below
  },
  credentials: "same-origin",
  body: JSON.stringify(payload)
});
```

Compatibility policy for `salient-poly`:
- the stock `salient-poly` contract is `schema_version: "2.0.0"` with `result.objects[]`
- the legacy `result.object` shape is treated as historical data only, not as an active compatibility surface for new plugin or downstream work
- if a downstream consumer still expects `result.object`, migrate or translate that consumer explicitly; the stock plugin, docs, and examples do not ship a compatibility shim

### CSRF Protection

Django requires CSRF tokens for POST requests. Extract from cookies:

```typescript
const getCsrfToken = (): string | null => {
  if (typeof document === 'undefined') {
    return null;
  }
  const match = document.cookie.match(/(?:^|;)\s*csrftoken=([^;]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
};

const headers: Record<string, string> = {
  'Content-Type': 'application/json'
};
const csrfToken = getCsrfToken();
if (csrfToken) {
  headers['X-CSRFToken'] = csrfToken;
}
```

### Image Coordinate Systems

**Critical:** Convert display coordinates to natural image pixels before submission.

```typescript
interface ImageInfo {
  naturalWidth: number;   // Original image resolution
  naturalHeight: number;
  renderedWidth: number;  // Displayed size in browser
  renderedHeight: number;
}

// Update metrics when image loads or window resizes
const updateImageMetrics = useCallback(() => {
  const img = imageRef.current;
  if (!img) return;

  setImageInfo({
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    renderedWidth: img.clientWidth,
    renderedHeight: img.clientHeight
  });
}, []);

// Convert display click to image pixels
const convertDisplayToImage = useCallback(
  (displayPoint: DisplayPoint): Point | null => {
    if (!imageInfo) return null;

    const scaleX = imageInfo.naturalWidth / imageInfo.renderedWidth;
    const scaleY = imageInfo.naturalHeight / imageInfo.renderedHeight;

    return {
      x: Number((displayPoint.x * scaleX).toFixed(2)),
      y: Number((displayPoint.y * scaleY).toFixed(2))
    };
  },
  [imageInfo]
);
```

This direct scaling example is correct for the current stock fit-first workspace model used by the
live plugins. If a future tranche ever reintroduces extra stage transforms, convert the raw stage
or client point back into untransformed display space before mapping into natural image pixels.
See `frontends/shared/src/viewport.ts` for the current fit-coordinate helper reference.

---

## 5. MTurk Integration (Optional)

For Amazon Mechanical Turk workflows, the backend provides extra metadata:

```typescript
import { readBootConfig } from '@anno-lab/shared';

interface MTurkBoot {
  assignmentId: string;
  hitId: string;
  workerId: string;
  sandbox: boolean;
  submitUrl: string;
}

const boot = readBootConfig();
if (boot.mturk) {
  const { assignmentId, hitId, workerId, submitUrl } = boot.mturk;
  // Handle MTurk-specific submission logic
}
```

The current `salient-poly` reference plugin uses MTurk metadata for provenance
(`workerId` and `assignmentId`-backed submission IDs). The shared submission hook now also
supports the stock MTurk closeout path: when no trusted `boot.writeToken` exists, it submits the
annotation envelope back to MTurk through `submitUrl` so backend MTurk sync/ingest can create the
annotation later without exposing a long-lived service token in the browser.

### MTurk Submission Workflow

1. User completes annotation and clicks Submit
2. If an operator-owned authenticated wrapper injected `boot.writeToken`, the plugin may call
   `POST /api/annotations/` with an assignment-backed `submission_id`
3. Otherwise, the shared submission hook serializes the canonical annotation envelope into the
   MTurk `annotation` answer field and submits the external form to `submitUrl`
4. MTurk records that answer against the assignment
5. Backend MTurk sync reads the `annotation` answer and `ingest_submitted_assignments` creates
   the `Annotation`, links the matching `Assignment`, and preserves the MTurk provenance payload
6. A raw external-submit form looks like:
   ```html
   <form method="POST" action={submitUrl}>
     <input type="hidden" name="assignmentId" value={mturk.assignmentId} />
     <input type="hidden" name="annotation" value={JSON.stringify(annotationEnvelope)} />
     <button type="submit">Submit to MTurk</button>
   </form>
   ```

The backend exposes `submitUrl`, but the stock frontend path now lives in the shared submission
hook rather than in each plugin separately.

### Optional Assignment Reference

If you have an `Assignment` object ID, pass it in the annotation:

```json
{
  "task": 42,
  "result": { /* ... */ },
  "assignment": 5
}
```

This links the annotation to MTurk tracking metadata (worker ID, HIT ID, etc.).

---

## 6. Build Process (Vite Example)

### Project Structure

```
salient-poly/
  package.json
  vite.config.ts
  tsconfig.json
  index.html
  src/
    main.tsx
    App.tsx
    styles.css
```

### package.json

```json
{
  "name": "salient-poly",
  "version": "0.2.7",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "eslint src vite.config.ts",
    "typecheck": "tsc --noEmit",
    "refactor:unused": "knip",
    "refactor:codemod-help": "jscodeshift --help"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@eslint/js": "^9.0.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "^4.3.4",
    "eslint": "^9.0.0",
    "eslint-plugin-react-hooks": "^5.0.0",
    "eslint-plugin-react-refresh": "^0.4.0",
    "globals": "^15.0.0",
    "jscodeshift": "^17.0.0",
    "knip": "^5.0.0",
    "typescript-eslint": "^8.0.0",
    "typescript": "^5.7.2",
    "vite": "^6.4.1"
  }
}
```

### vite.config.ts

Configure Vite to output assets in the structure manifest.json expects:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    cssCodeSplit: false,  // Single CSS file
    rollupOptions: {
      input: 'index.html',
      output: {
        entryFileNames: 'assets/index.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'assets/index.css';
          }
          return 'assets/[name][extname]';
        }
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173
  }
});
```

### index.html

Vite uses this template during build:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Salient Poly Plugin</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### Build Commands

```bash
cd frontends/salient-poly

# Install dependencies (once)
npm install

# Development mode (hot reload)
npm run dev
# Opens http://localhost:5173

# Production build
npm run build
# Generates dist/ with assets/index.js and assets/index.css

# Refactor-oriented checks
npm run lint
npm run typecheck
npm run refactor:unused
npm run refactor:codemod-help
```

### Output Structure

After `npm run build`, Vite creates:

```
dist/
  assets/
    index.js       # Main bundle
    index.css      # Styles
  index.html       # (not used by backend, only in dev)
```

The manifest.json references these:
```json
{
  "root": "salient-poly/dist",
  "js": ["assets/index.js"],
  "css": ["assets/index.css"]
}
```

---

## 7. Registration Process

### Step 1: Create TaskType (if new)

```bash
POSTGRES_HOST=localhost python backend/manage.py shell
```

```python
from core.models import TaskType

task_type, created = TaskType.objects.get_or_create(
    slug='salient_poly',
    defaults={
        'name': 'Salient Polygon',
        'description': 'Outline salient objects in an image with polygons'
    }
)
print(f"TaskType: {task_type.id} ({'created' if created else 'existing'})")
```

### Step 2: Register Plugin in Database

Use the Django admin or API:

**Option A: Django Admin**
1. Navigate to `/admin/core/frontendplugin/`
2. Click "Add Frontend Plugin"
3. Fill in:
   - **Task Type**: Select your TaskType
   - **Name**: "Salient Polygon Annotator"
   - **Version**: "0.1.0"
   - **Manifest**: Paste the manifest.json content as JSON
   - **Is Active**: Check to enable
4. Save

**Option B: REST API**
```bash
curl -X POST http://localhost:8000/api/plugins/ \
  -H "Content-Type: application/json" \
  -H "X-Anno-Lab-Write-Token: YOUR_WRITE_TOKEN" \
  -d '{
    "task_type": 2,
    "name": "Salient Polygon Annotator",
    "version": "0.2.7",
    "manifest": {
      "name": "Salient Polygon Annotator",
      "task_type": "salient_poly",
      "version": "0.2.7",
      "root": "salient-poly/dist",
      "css": ["assets/index.css"],
      "js": ["assets/index.js"],
      "result_schema_version": "2.0.0"
    },
    "is_active": true
  }'
```

### Step 3: Create TaskDefinition

```python
from core.models import TaskDefinition, TaskType

task_type = TaskType.objects.get(slug='salient_poly')
task_def, created = TaskDefinition.objects.get_or_create(
    task_type=task_type,
    version='1.0',
    defaults={
        'definition': {
            'instructions': 'Trace each salient object with its own polygon.'
        }
    }
)
print(f"TaskDefinition: {task_def.id}")
```

### Step 4: Create Tasks

```python
from core.models import Task, Project, Asset

project = Project.objects.first()
asset = Asset.objects.first()
task_def = TaskDefinition.objects.get(task_type__slug='salient_poly', version='1.0')

task = Task.objects.create(
    project=project,
    asset=asset,
    task_definition=task_def,
    status='pending',
    priority=1
)
print(f"Task: {task.id}")
```

### Step 5: Access Annotation UI

Navigate to: `http://localhost:8000/api/tasks/{task_id}/annotate/`

MTurk wrapper path:
- `http://localhost:8000/api/tasks/{task_id}/annotate/mturk/`

The backend will:
1. Load the TaskType for this task
2. Find the active FrontendPlugin for that TaskType
3. Inject the plugin HTML shell with `window.__ANNO_LAB_BOOT__`
4. Serve plugin assets from the manifest

---

## 8. Validation

### Command: validate_plugins

Django management command validates all registered plugins:

```bash
# Basic validation from the repo root
POSTGRES_HOST=localhost python backend/manage.py validate_plugins

# Fix validation errors (update DB from filesystem)
POSTGRES_HOST=localhost python backend/manage.py validate_plugins --fix

# Exit with error if any plugin fails
POSTGRES_HOST=localhost python backend/manage.py validate_plugins --strict
```

This command reads registered `FrontendPlugin` rows from the database before it reaches the filesystem checks. In a host shell that is using the Docker-published Postgres from `.env.example`, run it as `POSTGRES_HOST=localhost python backend/manage.py validate_plugins ...`; inside the Compose `web` container, keep `POSTGRES_HOST=db` and run `python manage.py validate_plugins ...`.

**What It Checks:**

1. **Manifest Structure**
   - All required fields present (name, task_type, version, root, js, css, result_schema_version)
   - Fields have correct types (strings, arrays)

2. **Plugin Root Path**
   - `root` path exists relative to `/frontends`
   - No directory traversal attempts (`..`)

3. **Asset Files**
   - All files in `js` and `css` arrays exist
   - Paths don't escape plugin root

4. **Filesystem Manifest**
   - Optional: Checks if `manifest.json` exists next to plugin
   - Optional: Warns if DB manifest differs from filesystem

### Example Output

```
Validating 2 plugin(s)...

✓ salient_poly (v0.1.0)
  OK
○ instance_bbox (v0.2.0)
  ERROR: Missing assets: assets/index.css

============================================================
ERRORS: 1
  - instance_bbox: Missing assets: ['assets/index.css']
```

### Common Validation Issues

**Issue:** `Manifest root '{root}' does not exist`
- **Cause:** Path in manifest.json doesn't point to a directory in `/frontends`
- **Fix:** Build your plugin (`npm run build`) and update manifest.json

**Issue:** `Manifest asset '{asset}' not found under {root}`
- **Cause:** Referenced JS/CSS files weren't built
- **Fix:** Run `npm run build` and check Vite config (especially output paths)

**Issue:** `Manifest path '{path}' escapes plugin root`
- **Cause:** Asset path contains `..` or `root` contains `..`
- **Fix:** Use relative paths that stay within plugin directory

**Issue:** `Manifest field 'js' must be a list`
- **Cause:** `js` is not an array in manifest.json
- **Fix:** Use `"js": ["assets/index.js"]` (array, not string)

---

## Summary: Creating Your Own Plugin

1. **Create plugin directory** in `/frontends/{plugin-name}/`

2. **Initialize project** with your chosen toolchain (Vite recommended)

3. **Write manifest.json** with required fields

4. **Implement annotation UI:**
   - Read task context with `readBootConfig()` from `@anno-lab/shared`
   - Fetch task data from `/api/tasks/{id}/bundle/`
   - Render the task media from `bundle.asset_url`
   - Submit annotations to `POST /api/annotations/`
   - Handle CSRF tokens

5. **Build** (`npm run build`)

6. **Validate** (`POSTGRES_HOST=localhost python backend/manage.py validate_plugins`)

7. **Register** in database (TaskType → FrontendPlugin → TaskDefinition)

8. **Test** at `/api/tasks/{task_id}/annotate/`

---

## Reference: Salient-poly Key Files

- **Manifest**: `/frontends/salient-poly/manifest.json`
- **Entry Point**: `/frontends/salient-poly/src/main.tsx`
- **Component**: `/frontends/salient-poly/src/App.tsx`
- **Build Config**: `/frontends/salient-poly/vite.config.ts`
- **Styles**: `/frontends/salient-poly/src/styles.css`

All examples in this guide are extracted from salient-poly's implementation.

---

## Troubleshooting

**Q: Plugin assets fail to load (404 errors)**
- A: Check plugin root path in manifest matches built dist/ directory
- A: Verify assets exist after `npm run build`
- A: Run `POSTGRES_HOST=localhost python backend/manage.py validate_plugins` to identify issues

**Q: Boot config is undefined**
- A: Use `readBootConfig()` from `@anno-lab/shared` (see section 2)
- A: Check browser console for window.__ANNO_LAB_BOOT__ value

**Q: Annotation submission fails**
- A: Verify CSRF token extraction works
- A: Check task ID is present in boot config
- A: Ensure submission_id is unique per submission (use UUID)

**Q: Plugin doesn't update after rebuild**
- A: Clear browser cache (Ctrl+Shift+Delete)
- A: Bump version in manifest.json and re-register plugin
- A: Run `POSTGRES_HOST=localhost python backend/manage.py validate_plugins --fix`

**Q: Image coordinates seem off**
- A: Verify natural vs. display pixel conversion (section 4)
- A: Check image aspect ratio and scaling CSS
- A: Log both image dimensions and click points to console
