# Frontend Plugin Design Principles

This document captures the UX and interaction rules that should shape the anno-lab plugin family.

These principles were informed by a comparative review of makesense.ai, but they are written here as anno-lab-native guidance. The goal is to borrow the speed and clarity of a strong annotation workstation without copying another tool's architecture or product structure.

## Product-Family Principle

anno-lab plugins should feel like one product family.

The shorthand remains:
- same product family
- different task tools

That means:
- the shell layout should stay recognizable across tasks
- feedback, focus, and selection treatment should feel consistent
- annotators should only need to learn the task mechanics that are genuinely unique to polygon, bbox, or keypoint work

That does not mean:
- every plugin needs identical buttons
- every toolbar must expose the same task tools
- task semantics should move into shared code just because the layouts look similar

## Core Workspace Rules

### 1. Persistent Workspace Shell

Every serious image plugin should feel like a stable workstation:
- central image or canvas workspace
- optional left rail for task context or navigation
- optional right rail for annotation objects or properties
- top toolbar for mode, precision, history, and task actions
- bottom status region for feedback, schema, counts, and shortcuts

On supported desktop widths:
- keep the shell inside one viewport when practical
- let rails or dense toolbar rows scroll internally before the document scrolls
- keep the image stage, primary controls, and status surface visible together

### 2. Fit-First Image Handling

The stock direction for the live spatial plugins is:
- the image stays fitted to the workspace
- annotators do not rely on stock zoom and pan for normal operation
- precision work happens through explicit inspection aids instead of viewport manipulation

If stock zoom and pan is ever introduced, it should be justified by supported task needs. It is not part of the default workspace model.

### 3. Precision Aids Must Be Explicit

Spatial tasks still need precision. The stock contract should therefore expose:
- a visible magnifier toggle
- visible magnification levels
- crosshair guides or equivalent cursor-position feedback
- large enough handles and hit targets for direct manipulation

The current live precision language is:
- image-only magnifier
- default `3x` lens
- supported levels `1.5x`, `3x`, and `5x`
- shared crosshair guides

Overlay-aware magnifier behavior should stay plugin-local unless multiple live plugins need the same visible contract.

### 4. Direct Manipulation Plus Explicit Controls

The main path should stay inside the image workspace:
- draw, place, resize, and drag directly on the image
- keep precision controls visible instead of hiding them behind hover-only affordances
- keep destructive actions reversible where practical
- do not hide primary editor state in dialogs

### 5. Selection Synchronization

Selection should be mirrored across surfaces:
- canvas selection should reflect in the relevant rail
- rail selection should reflect back into the canvas where practical
- active state must be readable without relying only on color

In short, selection stays synchronized between canvas and rails.

### 6. Visible Feedback

Annotators need constant context:
- current task state should remain visible
- submission and validation feedback should be explicit
- warnings should be readable and non-destructive by default
- success feedback should confirm the completed action without forcing a mode switch

### 7. Context-Aware Hotkeys

Hotkeys are part of usability, not post-hoc polish:
- only fire editor shortcuts while the editor context owns focus
- never hijack typing in inputs or dialogs
- keep shortcut hints visible in the shell
- standardize the high-value set where the user-visible contract is actually shared

For the current live plugins, the shared high-value precision shortcut is:
- `M` for the magnifier

Task-specific shortcuts should remain local unless more than one live plugin proves the same visible contract.

### 8. Scalable Rails

Rails should stay usable as annotation counts grow:
- support empty states instead of blank panels
- keep row state simple and legible
- show selection and completion state directly in rows
- treat virtualization and larger list primitives as shared candidates only when more than one live plugin actually needs them

### 9. Fail Closed On Unsupported Viewports

Do not silently degrade serious annotation on cramped screens:
- if a viewport is too small for safe editing, say so explicitly
- preserve operator clarity over half-working behavior
- only revisit narrower layouts when they can be first-class, not accidental

## Shared Frontend Boundary

Current shared layer:
- `WorkspaceShell`
- `PanelSection`
- `StatusFooter`
- `ToastRegion`
- `EmptyState`
- `readBootConfig()`
- `useTaskBundle`
- `useAnnotationSubmit`
- geometry and fit-coordinate helpers
- `useHotkeys`, `useSelectionSync`, and `useImageStageMetrics`
- the current magnifier and crosshair primitives

These remain plugin-specific:
- annotation geometry editing
- task-definition semantics
- discipline-specific validation
- task-specific mode ownership
- dataset navigation and pre-submit review flows unless multiple live plugins prove the same visible contract
- result JSON shape
- submission placement and task-shaped destructive actions

Keep these potential shared surfaces plugin-local unless multiple live plugins need the same stable contract:
- a shared `PrecisionControls` cluster
- history helpers
- dialog infrastructure
- scalable list primitives
- overlay-aware magnifier behavior

## Acceptance Checklist

Before calling the shared shell direction successful, verify:
- the three live plugins keep a recognizable common shell
- the image stays fitted to the workspace on supported desktop layouts
- precision controls are visible and consistent across the live plugins
- selection stays synchronized between canvas and rails where applicable
- keyboard shortcuts stay scoped to the editor
- task-specific mechanics remain local instead of leaking into shared code

The second real plugin should prove this shared-shell model, and later live plugins should strengthen it without flattening task-specific mechanics.

Use `docs/plugin-guide.md` for implementation details.
