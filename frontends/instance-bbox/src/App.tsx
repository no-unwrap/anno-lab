import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

import {
  DEFAULT_MAGNIFIER_LEVEL,
  DEFAULT_VIEWPORT,
  formatMagnificationLabel,
  MAGNIFIER_LEVELS,
  isViewportDisplayPointInsideImage,
  PanelSection,
  readBootConfig,
  stagePointToImagePoint,
  stagePointToViewportDisplayPoint,
  StatusFooter,
  useAnnotationSubmit,
  useHoverMagnifier,
  useHotkeys,
  useImageStageMetrics,
  useSelectionSync,
  useTaskBundle,
  WorkspaceShell,
} from '@anno-lab/shared';
import type {
  DisplayPoint,
  FeedbackState,
  ImagePoint,
  ImageRect,
  MagnifierLevel,
  ToastMessage
} from '@anno-lab/shared';

import {
  createDrawingInteraction,
  createMoveInteraction,
  createResizeInteraction,
  resolveInteractionMove
} from './bboxInteractions';
import {
  isRectAtLeastSize,
  normalizeBoxRect,
  type ImageBounds
} from './bboxGeometry';
import {
  applyCommittedBboxSnapshot,
  canRedoBboxEditorChange,
  canUndoBboxEditorChange,
  cancelBboxDragHistory,
  createBox,
  createBboxEditorHistoryState,
  createBboxEditorSnapshot,
  finishBboxDragHistory,
  redoBboxEditorChange,
  removeBox,
  replaceBoxLabel,
  replaceBoxRect,
  resolveLabels,
  startBboxDragHistory,
  type BboxEditorHistoryState,
  type BboxEditorSnapshot,
  undoBboxEditorChange
} from './bboxState';
import {
  DEFAULT_FEEDBACK,
  RESULT_SCHEMA_VERSION,
  SHORTCUTS,
  TEST_JPG_URL,
  TOOL_VERSION
} from './constants';
import { BboxCanvas } from './components/BboxCanvas';
import { BboxObjectRail } from './components/BboxObjectRail';
import { loadPreAnnotatedBoxes } from './preAnnotations';
import type {
  BboxDefinition,
  Box,
  ClientPoint,
  InteractionState,
  ResizeHandle,
  ToolMode
} from './types';

const MagnifierIcon = () => (
  <svg
    aria-hidden="true"
    className="anno-lab-button__icon"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
  >
    <circle cx="7" cy="7" r="4.5" />
    <path d="m10.4 10.4 3.1 3.1" strokeLinecap="round" />
  </svg>
);

const App = () => {
  const boot = readBootConfig();
  const { bundle, error: bundleError, loading } = useTaskBundle<BboxDefinition>({
    taskId: boot.taskId,
    apiBase: boot.apiBase
  });
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [history, setHistory] = useState(createBboxEditorHistoryState);
  const [mode, setMode] = useState<ToolMode>('draw');
  const [interaction, setInteraction] = useState<InteractionState>(null);
  const [magnifierEnabled, setMagnifierEnabled] = useState(false);
  const [magnifierLevel, setMagnifierLevel] =
    useState<MagnifierLevel>(DEFAULT_MAGNIFIER_LEVEL);
  const [editorFeedback, setEditorFeedback] = useState<FeedbackState>(DEFAULT_FEEDBACK);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const { metrics, refreshMetrics } = useImageStageMetrics({
    imageRef,
    fallbackNaturalWidth: bundle?.asset.width,
    fallbackNaturalHeight: bundle?.asset.height
  });
  const { selectedId, select, isSelected } = useSelectionSync<string>(null);
  const {
    feedback: submissionFeedback,
    isSubmitting,
    resetFeedback: resetSubmissionFeedback,
    submit
  } = useAnnotationSubmit({
    taskId: boot.taskId,
    apiBase: boot.apiBase,
    actor: boot.actor,
    boot
  });
  const boxesRef = useRef<Box[]>([]);
  const selectedIdRef = useRef<string | null>(null);
  const historyRef = useRef<BboxEditorHistoryState>(createBboxEditorHistoryState());
  const interactionRef = useRef<InteractionState>(null);
  const metricsRef = useRef(metrics);

  const definition = bundle?.task_definition.definition;
  const labels = useMemo(() => resolveLabels(definition ?? {}), [definition]);
  const minBoxSize =
    typeof definition?.min_box_size === 'number' ? Math.max(4, definition.min_box_size) : 12;
  const instructionText =
    typeof definition?.instructions === 'string' && definition.instructions.trim()
      ? definition.instructions
      : 'Draw tight boxes around each visible object instance.';
  const resolvedImageUrl = bundle?.asset_url ?? (!boot.taskId ? TEST_JPG_URL : undefined);
  const initialBoxes = useMemo(
    () => (bundle ? loadPreAnnotatedBoxes(bundle.task.payload, labels) : []),
    [bundle, labels]
  );
  const assetWidth = metrics?.naturalWidth ?? bundle?.asset.width ?? 0;
  const assetHeight = metrics?.naturalHeight ?? bundle?.asset.height ?? 0;
  const assetBounds = useMemo<ImageBounds>(
    () => ({
      width: assetWidth,
      height: assetHeight
    }),
    [assetHeight, assetWidth]
  );
  const selectedBox = boxes.find((box) => box.id === selectedId) ?? null;
  const canSubmit = Boolean(boot.taskId) && boxes.length > 0 && !isSubmitting;
  const canInspectImage = Boolean(metrics && resolvedImageUrl);
  const interactionActive = interaction !== null;
  const canUndoHistory = canUndoBboxEditorChange(history);
  const canRedoHistory = canRedoBboxEditorChange(history);
  const magnifier = useHoverMagnifier({
    active: magnifierEnabled,
    imageUrl: resolvedImageUrl,
    lensMagnification: magnifierLevel,
    metrics,
    resolveDisplayPoint: useCallback((stagePoint, currentMetrics) => {
      const displayPoint = stagePointToViewportDisplayPoint(stagePoint, DEFAULT_VIEWPORT);
      return isViewportDisplayPointInsideImage(displayPoint, currentMetrics) ? displayPoint : null;
    }, []),
    stageRef,
    suspended: interactionActive
  });

  const setFeedback = useCallback(
    (nextFeedback: FeedbackState) => {
      resetSubmissionFeedback();
      setEditorFeedback(nextFeedback);
    },
    [resetSubmissionFeedback]
  );

  const setInteractionState = useCallback(
    (nextInteraction: InteractionState | ((current: InteractionState) => InteractionState)) => {
      setInteraction((currentInteraction) => {
        const resolvedInteraction =
          typeof nextInteraction === 'function'
            ? nextInteraction(currentInteraction)
            : nextInteraction;
        interactionRef.current = resolvedInteraction;
        return resolvedInteraction;
      });
    },
    []
  );

  const setBoxesState = useCallback(
    (nextBoxes: Box[] | ((current: Box[]) => Box[])) => {
      setBoxes((currentBoxes) => {
        const resolvedBoxes =
          typeof nextBoxes === 'function' ? nextBoxes(currentBoxes) : nextBoxes;
        boxesRef.current = resolvedBoxes;
        return resolvedBoxes;
      });
    },
    []
  );

  const setHistoryState = useCallback(
    (nextHistory: BboxEditorHistoryState | ((current: BboxEditorHistoryState) => BboxEditorHistoryState)) => {
      setHistory((currentHistory) => {
        const resolvedHistory =
          typeof nextHistory === 'function' ? nextHistory(currentHistory) : nextHistory;
        historyRef.current = resolvedHistory;
        return resolvedHistory;
      });
    },
    []
  );

  const selectBoxId = useCallback(
    (nextId: string | null) => {
      selectedIdRef.current = nextId;
      select(nextId);
    },
    [select]
  );

  const createCurrentEditorSnapshot = useCallback(
    (): BboxEditorSnapshot =>
      createBboxEditorSnapshot({
        boxes: boxesRef.current,
        selectedBoxId: selectedIdRef.current
      }),
    []
  );

  const applyEditorSnapshot = useCallback(
    (snapshot: BboxEditorSnapshot) => {
      setBoxesState(snapshot.boxes);
      selectBoxId(snapshot.selectedBoxId);
    },
    [selectBoxId, setBoxesState]
  );

  const commitEditorSnapshot = useCallback(
    (nextSnapshot: BboxEditorSnapshot) => {
      const currentSnapshot = createCurrentEditorSnapshot();
      applyEditorSnapshot(nextSnapshot);
      setHistoryState((currentHistory) =>
        applyCommittedBboxSnapshot(currentHistory, currentSnapshot, nextSnapshot)
      );
    },
    [applyEditorSnapshot, createCurrentEditorSnapshot, setHistoryState]
  );

  useEffect(() => {
    metricsRef.current = metrics;
  }, [metrics]);

  useEffect(() => {
    if (!bundle) {
      setBoxesState([]);
      selectBoxId(null);
      setHistoryState(createBboxEditorHistoryState());
      setMode('draw');
      return;
    }

    setBoxesState(initialBoxes);
    selectBoxId(initialBoxes[0]?.id ?? null);
    setHistoryState(createBboxEditorHistoryState());
    setMode(initialBoxes.length ? 'select' : 'draw');

    setFeedback(
      initialBoxes.length
        ? {
            tone: 'neutral',
            label: 'Pre-annotations',
            message:
              initialBoxes.length === 1
                ? 'Loaded 1 predicted box from Task.payload. Review and refine before submitting.'
                : `Loaded ${initialBoxes.length} predicted boxes from Task.payload. Review and refine before submitting.`
          }
        : DEFAULT_FEEDBACK
    );
  }, [bundle, initialBoxes, selectBoxId, setBoxesState, setFeedback, setHistoryState]);

  useEffect(() => {
    setInteractionState(null);
  }, [bundle?.task.id, setInteractionState]);

  const focusStage = useCallback(() => {
    stageRef.current?.focus();
  }, []);

  const setModeWithFeedback = useCallback(
    (nextMode: ToolMode) => {
      setMode(nextMode);
      setFeedback({
        tone: 'neutral',
        label: 'Mode',
        message:
          nextMode === 'draw'
            ? 'Draw mode active.'
            : 'Select mode active.'
      });
    },
    [setFeedback]
  );

  const handleToggleMagnifier = useCallback(() => {
    const nextEnabled = !magnifierEnabled;
    setMagnifierEnabled(nextEnabled);
    magnifier.clear();
    focusStage();
    setFeedback({
      tone: 'neutral',
      label: 'Magnifier',
      message: nextEnabled
        ? `Precision mode on at ${formatMagnificationLabel(magnifierLevel)} with crosshair guides.`
        : 'Magnifier hidden.'
    });
  }, [focusStage, magnifier, magnifierEnabled, magnifierLevel, setFeedback]);

  const handleSetMagnifierLevel = useCallback(
    (nextLevel: MagnifierLevel) => {
      setMagnifierLevel(nextLevel);
      magnifier.clear();
      focusStage();
      setFeedback({
        tone: 'neutral',
        label: 'Magnifier',
        message: `Magnifier level set to ${formatMagnificationLabel(nextLevel)}.`
      });
    },
    [focusStage, magnifier, setFeedback]
  );

  const getStagePoint = useCallback(({ clientX, clientY }: ClientPoint): DisplayPoint | null => {
    if (!stageRef.current) {
      return null;
    }

    const rect = stageRef.current.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }, []);

  const getImagePointFromClient = useCallback(
    (
      clientPoint: ClientPoint,
      options: { clampToImage?: boolean; requireInside?: boolean } = {}
    ): ImagePoint | null => {
      const currentMetrics = metricsRef.current;
      if (!currentMetrics) {
        return null;
      }

      const stagePoint = getStagePoint(clientPoint);
      if (!stagePoint) {
        return null;
      }

      const viewportDisplayPoint = stagePointToViewportDisplayPoint(stagePoint, DEFAULT_VIEWPORT);
      if (
        options.requireInside &&
        !isViewportDisplayPointInsideImage(viewportDisplayPoint, currentMetrics)
      ) {
        return null;
      }

      return stagePointToImagePoint(stagePoint, currentMetrics, DEFAULT_VIEWPORT, {
        clampToImage: options.clampToImage
      });
    },
    [getStagePoint]
  );

  const updateBox = useCallback((boxId: string, nextRect: ImageRect) => {
    setBoxesState((currentBoxes) => replaceBoxRect(currentBoxes, boxId, nextRect));
  }, [setBoxesState]);

  const handleStageMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      focusStage();
      if (
        event.target !== event.currentTarget ||
        event.button !== 0 ||
        !metricsRef.current ||
        !resolvedImageUrl
      ) {
        return;
      }

      if (mode === 'select') {
        selectBoxId(null);
        setFeedback({
          tone: 'neutral',
          label: 'Selection',
          message: 'No object selected.'
        });
      }
    },
    [focusStage, mode, resolvedImageUrl, selectBoxId, setFeedback]
  );

  const handleCanvasMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      focusStage();
      if (event.button !== 0 || !metricsRef.current || !resolvedImageUrl) {
        return;
      }

      if (mode === 'draw') {
        const imagePoint = getImagePointFromClient(event, { requireInside: true });
        if (!imagePoint) {
          return;
        }

        selectBoxId(null);
        setInteractionState(createDrawingInteraction(imagePoint));
        setFeedback({
          tone: 'neutral',
          label: 'Draw',
          message: 'Drag to size the new bounding box.'
        });
        return;
      }

      selectBoxId(null);
      setFeedback({
        tone: 'neutral',
        label: 'Selection',
        message: 'No object selected.'
      });
    },
    [
      focusStage,
      getImagePointFromClient,
      mode,
      resolvedImageUrl,
      selectBoxId,
      setFeedback,
      setInteractionState
    ]
  );

  const handleInteractionMove = useCallback(
    (clientPoint: ClientPoint) => {
      const currentInteraction = interactionRef.current;
      if (!currentInteraction) {
        return;
      }

      const moveResult = resolveInteractionMove(currentInteraction, {
        imagePoint: getImagePointFromClient(clientPoint, { clampToImage: true }),
        assetBounds,
        minBoxSize
      });
      if (!moveResult) {
        return;
      }

      if (moveResult.kind === 'interaction') {
        setInteractionState(moveResult.interaction);
        return;
      }

      updateBox(moveResult.boxId, moveResult.rect);
    },
    [
      assetBounds,
      getImagePointFromClient,
      minBoxSize,
      setInteractionState,
      updateBox
    ]
  );

  const handleInteractionEnd = useCallback(() => {
    const currentInteraction = interactionRef.current;
    if (!currentInteraction) {
      return;
    }

    if (currentInteraction.type === 'drawing') {
      const nextRect = normalizeBoxRect(
        currentInteraction.start,
        currentInteraction.current,
        assetBounds
      );
      if (!isRectAtLeastSize(nextRect, minBoxSize)) {
        setFeedback({
          tone: 'warning',
          label: 'Too small',
          message: `Boxes must be at least ${minBoxSize} px on each side.`
        });
        setInteractionState(null);
        return;
      }

      const nextBox = createBox(nextRect, labels[0]);
      commitEditorSnapshot(
        createBboxEditorSnapshot({
          boxes: [...boxesRef.current, nextBox],
          selectedBoxId: nextBox.id
        })
      );
      setMode('select');
      setFeedback({
        tone: 'neutral',
        label: 'Box created',
        message: 'Bounding box added and selected. Adjust the label in the object rail.'
      });
    } else {
      setHistoryState((currentHistory) =>
        finishBboxDragHistory(currentHistory, createCurrentEditorSnapshot())
      );
      setFeedback({
        tone: 'neutral',
        label: currentInteraction.type === 'moving' ? 'Move' : 'Resize',
        message: 'Bounding box updated.'
      });
    }

    setInteractionState(null);
  }, [
    assetBounds,
    commitEditorSnapshot,
    createCurrentEditorSnapshot,
    labels,
    minBoxSize,
    setFeedback,
    setHistoryState,
    setInteractionState
  ]);

  useEffect(() => {
    if (!interactionActive) {
      return undefined;
    }

    const ownerDocument = stageRef.current?.ownerDocument ?? document;
    const handleMouseMove = (event: MouseEvent) => handleInteractionMove(event);
    const handleMouseUp = () => handleInteractionEnd();

    ownerDocument.addEventListener('mousemove', handleMouseMove);
    ownerDocument.addEventListener('mouseup', handleMouseUp);

    return () => {
      ownerDocument.removeEventListener('mousemove', handleMouseMove);
      ownerDocument.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleInteractionEnd, handleInteractionMove, interactionActive]);

  const draftRect =
    interaction && interaction.type === 'drawing'
      ? normalizeBoxRect(interaction.start, interaction.current, assetBounds)
      : null;

  const selectBox = useCallback(
    (boxId: string, message: string) => {
      selectBoxId(boxId);
      setMode('select');
      focusStage();
      setFeedback({
        tone: 'neutral',
        label: 'Selection',
        message
      });
    },
    [focusStage, selectBoxId, setFeedback]
  );

  const deleteSelectedBox = useCallback(() => {
    if (!selectedId) {
      return;
    }

    setInteractionState(null);
    commitEditorSnapshot(
      createBboxEditorSnapshot({
        boxes: removeBox(boxesRef.current, selectedId),
        selectedBoxId: null
      })
    );
    setFeedback({
      tone: 'neutral',
      label: 'Delete',
      message: 'Selected box removed.'
    });
  }, [commitEditorSnapshot, selectedId, setFeedback, setInteractionState]);

  const handleBoxMouseDown = useCallback(
    (event: ReactMouseEvent<SVGRectElement>, box: Box, index: number) => {
      if (event.button !== 0) {
        return;
      }

      event.stopPropagation();
      focusStage();
      selectBox(box.id, `Box ${index + 1} selected from the canvas.`);
      if (mode !== 'select') {
        return;
      }

      const imagePoint = getImagePointFromClient(event, { clampToImage: true });
      if (!imagePoint) {
        return;
      }

      setHistoryState((currentHistory) =>
        startBboxDragHistory(currentHistory, createCurrentEditorSnapshot())
      );
      setInteractionState(createMoveInteraction(box.id, imagePoint, box.rect));
    },
    [
      createCurrentEditorSnapshot,
      focusStage,
      getImagePointFromClient,
      mode,
      selectBox,
      setHistoryState,
      setInteractionState
    ]
  );

  const handleHandleMouseDown = useCallback(
    (
      event: ReactMouseEvent<SVGCircleElement>,
      box: Box,
      handle: ResizeHandle
    ) => {
      if (event.button !== 0) {
        return;
      }

      event.stopPropagation();
      focusStage();
      selectBox(box.id, `Resizing ${box.label}.`);
      setHistoryState((currentHistory) =>
        startBboxDragHistory(currentHistory, createCurrentEditorSnapshot())
      );
      setInteractionState(createResizeInteraction(box.id, handle, box.rect));
    },
    [createCurrentEditorSnapshot, focusStage, selectBox, setHistoryState, setInteractionState]
  );

  const handleSelectBoxFromRail = useCallback(
    (boxId: string, index: number) => {
      selectBox(boxId, `Box ${index + 1} selected from the object rail.`);
    },
    [selectBox]
  );

  const handleSelectLabel = useCallback(
    (label: string) => {
      if (!selectedBox || selectedBox.label === label) {
        return;
      }

      commitEditorSnapshot(
        createBboxEditorSnapshot({
          boxes: replaceBoxLabel(boxesRef.current, selectedBox.id, label),
          selectedBoxId: selectedBox.id
        })
      );
      setFeedback({
        tone: 'neutral',
        label: 'Label',
        message: `Label updated to ${label}.`
      });
    },
    [commitEditorSnapshot, selectedBox, setFeedback]
  );

  const undoEditorChange = useCallback(() => {
    if (interactionRef.current || !canUndoHistory) {
      return;
    }

    const transition = undoBboxEditorChange(historyRef.current, createCurrentEditorSnapshot());
    if (!transition) {
      return;
    }

    setInteractionState(null);
    applyEditorSnapshot(transition.snapshot);
    setHistoryState(transition.history);
    focusStage();
    setFeedback({
      tone: 'neutral',
      label: 'Undo',
      message: 'Reverted the last box edit.'
    });
  }, [
    applyEditorSnapshot,
    canUndoHistory,
    createCurrentEditorSnapshot,
    focusStage,
    setFeedback,
    setHistoryState,
    setInteractionState
  ]);

  const redoEditorChange = useCallback(() => {
    if (interactionRef.current || !canRedoHistory) {
      return;
    }

    const transition = redoBboxEditorChange(historyRef.current, createCurrentEditorSnapshot());
    if (!transition) {
      return;
    }

    setInteractionState(null);
    applyEditorSnapshot(transition.snapshot);
    setHistoryState(transition.history);
    focusStage();
    setFeedback({
      tone: 'neutral',
      label: 'Redo',
      message: 'Restored the reverted box edit.'
    });
  }, [
    applyEditorSnapshot,
    canRedoHistory,
    createCurrentEditorSnapshot,
    focusStage,
    setFeedback,
    setHistoryState,
    setInteractionState
  ]);

  useHotkeys({
    scopeRef: stageRef,
    onKeyDown: (event) => {
      const lowerKey = event.key.toLowerCase();
      const currentInteraction = interactionRef.current;
      const isHistoryShortcut = event.metaKey || event.ctrlKey;

      if (isHistoryShortcut && lowerKey === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redoEditorChange();
        } else {
          undoEditorChange();
        }
      } else if (isHistoryShortcut && lowerKey === 'y') {
        event.preventDefault();
        redoEditorChange();
      } else if (lowerKey === 'd') {
        event.preventDefault();
        setModeWithFeedback('draw');
      } else if (lowerKey === 'v') {
        event.preventDefault();
        setModeWithFeedback('select');
      } else if (lowerKey === 'm') {
        event.preventDefault();
        handleToggleMagnifier();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedId) {
          event.preventDefault();
          deleteSelectedBox();
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        if (currentInteraction?.type === 'drawing') {
          setInteractionState(null);
          setFeedback({
            tone: 'neutral',
            label: 'Canceled',
            message: 'Draft interaction canceled.'
          });
        } else if (currentInteraction) {
          const canceledDrag = cancelBboxDragHistory(historyRef.current);
          setHistoryState(canceledDrag.history);
          if (canceledDrag.snapshot) {
            applyEditorSnapshot(canceledDrag.snapshot);
          }
          setInteractionState(null);
          setFeedback({
            tone: 'neutral',
            label: 'Canceled',
            message: 'Canceled the current box edit.'
          });
        } else {
          selectBoxId(null);
          setFeedback({
            tone: 'neutral',
            label: 'Selection',
            message: 'Selection cleared.'
          });
        }
      }
    }
  });

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) {
      return;
    }

    try {
      await submit({
        result: {
          objects: boxes.map((box) => ({
            id: box.id,
            label: box.label,
            bbox: box.rect
          }))
        },
        schemaVersion: RESULT_SCHEMA_VERSION,
        toolVersion: TOOL_VERSION,
        rawPayload: {
          source: 'instance-bbox',
          ui: {
            mode,
            object_count: boxes.length,
            selected_box_id: selectedId
          }
        },
        successMessage: 'Bounding boxes submitted successfully.'
      });
    } catch {
      // Shared hook owns error feedback.
    }
  }, [boxes, canSubmit, mode, selectedId, submit]);

  const activeFeedback =
    submissionFeedback.tone === 'neutral' ? editorFeedback : submissionFeedback;

  const toasts: ToastMessage[] =
    submissionFeedback.tone === 'neutral'
      ? []
      : [
          {
            id: `instance-bbox-submit-${submissionFeedback.tone}`,
            tone: submissionFeedback.tone,
            title: submissionFeedback.label || 'anno-lab',
            message: submissionFeedback.message
          }
        ];

  const workspaceMessage = bundleError
    ? bundleError
    : loading
      ? 'Loading task bundle…'
      : !resolvedImageUrl
        ? 'Task asset delivery is not configured for this task.'
        : !metrics
          ? 'Loading image…'
          : '';

  return (
    <WorkspaceShell
      eyebrow="anno-lab · Instance Bounding Box"
      title="Annotate visible instances with bounding boxes"
      subtitle={instructionText}
      shortcuts={SHORTCUTS}
      toasts={toasts}
      toolbar={
        <>
          <div className="anno-lab-toolbar-group" data-toolbar-group="mode" role="group" aria-label="Editor mode controls">
            <button
              className={`anno-lab-button anno-lab-button--ghost ${mode === 'draw' ? 'is-active' : ''}`}
              type="button"
              onClick={() => setModeWithFeedback('draw')}
            >
              Draw
            </button>
            <button
              className={`anno-lab-button anno-lab-button--ghost ${mode === 'select' ? 'is-active' : ''}`}
              type="button"
              onClick={() => setModeWithFeedback('select')}
            >
              Select
            </button>
            <button
              className={`anno-lab-button anno-lab-button--ghost ${magnifierEnabled ? 'is-active' : ''}`}
              type="button"
              onClick={handleToggleMagnifier}
              disabled={!canInspectImage}
            >
              <span className="anno-lab-button__label">
                <MagnifierIcon />
                <span>Magnifier</span>
              </span>
            </button>
          </div>
          <div className="anno-lab-toolbar-group" data-toolbar-group="precision" role="group" aria-label="Precision controls">
            {MAGNIFIER_LEVELS.map((level) => (
              <button
                key={level}
                className={`anno-lab-button anno-lab-button--ghost ${magnifierLevel === level ? 'is-active' : ''}`}
                type="button"
                onClick={() => handleSetMagnifierLevel(level)}
                disabled={!canInspectImage}
              >
                {formatMagnificationLabel(level)}
              </button>
            ))}
          </div>
          <div className="anno-lab-toolbar-group" data-toolbar-group="history" role="group" aria-label="History controls">
            <button
              className="anno-lab-button anno-lab-button--ghost"
              type="button"
              onClick={undoEditorChange}
              disabled={!canUndoHistory || interactionActive}
            >
              Undo
            </button>
            <button
              className="anno-lab-button anno-lab-button--ghost"
              type="button"
              onClick={redoEditorChange}
              disabled={!canRedoHistory || interactionActive}
            >
              Redo
            </button>
          </div>
          <div className="anno-lab-toolbar-group" data-toolbar-group="annotation" role="group" aria-label="Annotation actions">
            <button
              className="anno-lab-button anno-lab-button--danger"
              type="button"
              onClick={deleteSelectedBox}
              disabled={!selectedBox}
            >
              Delete selected
            </button>
            <button
              className="anno-lab-button anno-lab-button--primary"
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
              {isSubmitting ? 'Submitting…' : 'Submit boxes'}
            </button>
          </div>
        </>
      }
      leftRail={
        <>
          <PanelSection title="Task snapshot" eyebrow="Current asset">
            <div className="anno-lab-thumbnail-card">
              {resolvedImageUrl ? (
                <img alt="Task preview" src={resolvedImageUrl} />
              ) : (
                <div className="anno-lab-thumbnail-card__placeholder">Awaiting asset URL</div>
              )}
              <dl className="anno-lab-detail-list">
                <div>
                  <dt>Task</dt>
                  <dd>{bundle?.task.id ?? 'Preview'}</dd>
                </div>
                <div>
                  <dt>Task type</dt>
                  <dd>{bundle?.task_type.slug ?? 'instance_bbox'}</dd>
                </div>
                <div>
                  <dt>Available labels</dt>
                  <dd>{labels.length}</dd>
                </div>
              </dl>
            </div>
          </PanelSection>
          <PanelSection title="Label set" eyebrow="Task definition">
            <div className="anno-lab-pill-list">
              {labels.map((label) => (
                <span key={label} className="anno-lab-pill">
                  {label}
                </span>
              ))}
            </div>
          </PanelSection>
        </>
      }
      rightRail={
        <BboxObjectRail
          boxes={boxes}
          labels={labels}
          selectedBox={selectedBox}
          isSelected={isSelected}
          onSelectBox={handleSelectBoxFromRail}
          onSelectLabel={handleSelectLabel}
        />
      }
      footer={
        <StatusFooter
          feedback={activeFeedback}
          meta={[
            { label: 'Boxes', value: String(boxes.length) },
            { label: 'Mode', value: mode },
            { label: 'View', value: 'Fit' },
            { label: 'Lens', value: formatMagnificationLabel(magnifierLevel) },
            { label: 'Selection', value: selectedBox ? 'Synced' : 'None' },
            { label: 'Schema', value: RESULT_SCHEMA_VERSION }
          ]}
          shortcuts={SHORTCUTS}
        />
      }
    >
      <BboxCanvas
        boxes={boxes}
        draftRect={draftRect}
        imageRef={imageRef}
        isSelected={isSelected}
        magnifierCrosshair={magnifier.crosshair}
        magnifierLens={magnifier.lens}
        metrics={metrics}
        mode={mode}
        onBoxMouseDown={handleBoxMouseDown}
        onCanvasMouseDown={handleCanvasMouseDown}
        onHandleMouseDown={handleHandleMouseDown}
        onStageMouseDown={handleStageMouseDown}
        onStageMouseLeave={magnifier.clear}
        onStageMouseMove={magnifier.updateFromClientPoint}
        refreshMetrics={refreshMetrics}
        resolvedImageUrl={resolvedImageUrl}
        stageRef={stageRef}
        workspaceMessage={workspaceMessage}
      />
    </WorkspaceShell>
  );
};

export default App;
