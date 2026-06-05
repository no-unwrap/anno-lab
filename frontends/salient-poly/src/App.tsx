import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState
} from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

import {
  DEFAULT_MAGNIFIER_LEVEL,
  DEFAULT_VIEWPORT,
  formatMagnificationLabel,
  MAGNIFIER_LEVELS,
  imagePointToDisplay,
  isViewportDisplayPointInsideImage,
  readBootConfig,
  stagePointToImagePoint,
  stagePointToViewportDisplayPoint,
  StatusFooter,
  useAnnotationSubmit,
  useHoverMagnifier,
  useHotkeys,
  useImageStageMetrics,
  useTaskBundle,
  WorkspaceShell
} from '@anno-lab/shared';
import type {
  FeedbackState,
  MagnifierLevel,
  TaskBundle,
  ToastMessage
} from '@anno-lab/shared';

import {
  DEFAULT_FEEDBACK,
  RESULT_SCHEMA_VERSION,
  SALIENT_OBJECT_LABEL,
  SHORTCUTS,
  TEST_JPG_URL,
  TOOL_VERSION
} from './constants';
import {
  resolveInstructionText,
  resolveMinPoints
} from './salientDefinition';
import {
  buildDisplayPolygons,
  buildPolygonSubmissionObjects,
  createPolygonId,
  formatPolygonName,
  getPolygonInsertPoint
} from './salientGeometry';
import {
  isNearFirstDraftVertex
} from './salientInteractions';
import {
  canCloseDraftPolygon,
  canRedoEditorChange,
  canUndoEditorChange,
  createSalientEditorState,
  getSelectedPolygonIndex,
  hasDraftPoints,
  salientEditorReducer
} from './salientState';
import { SalientAnnotationRail } from './components/SalientAnnotationRail';
import { SalientCanvas } from './components/SalientCanvas';
import { SalientTaskRail } from './components/SalientTaskRail';
import type {
  ClientPoint,
  DisplayPolygon,
  SalientDefinition,
  VertexDragState
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
  const { bundle, error: bundleError, loading } = useTaskBundle<SalientDefinition>({
    taskId: boot.taskId,
    apiBase: boot.apiBase
  });
  const definition = bundle?.task_definition.definition ?? {};
  const minPoints = resolveMinPoints(definition);
  const instructionText = resolveInstructionText(definition);
  const resolvedImageUrl = bundle?.asset_url ?? (!boot.taskId ? TEST_JPG_URL : undefined);

  const [editorState, dispatch] = useReducer(
    salientEditorReducer,
    undefined,
    createSalientEditorState
  );
  const [draftClosePreviewActive, setDraftClosePreviewActive] = useState(false);
  const [magnifierEnabled, setMagnifierEnabled] = useState(false);
  const [magnifierLevel, setMagnifierLevel] =
    useState<MagnifierLevel>(DEFAULT_MAGNIFIER_LEVEL);
  const [pointRemovalModeActive, setPointRemovalModeActive] = useState(false);
  const [editorFeedback, setEditorFeedback] =
    useState<FeedbackState>(DEFAULT_FEEDBACK);

  const imageRef = useRef<HTMLImageElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const interactionRef = useRef<VertexDragState | null>(null);
  const metricsRef = useRef<typeof metrics>(null);
  const { metrics, refreshMetrics } = useImageStageMetrics({
    imageRef,
    fallbackNaturalWidth: bundle?.asset.width,
    fallbackNaturalHeight: bundle?.asset.height
  });
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

  const displayPolygons = useMemo(
    () => buildDisplayPolygons(editorState.polygons, metrics),
    [editorState.polygons, metrics]
  );
  const selectedPolygon = useMemo(
    () =>
      displayPolygons.find(
        (polygon) => polygon.id === editorState.selectedPolygonId
      ) ?? null,
    [displayPolygons, editorState.selectedPolygonId]
  );
  const selectedPolygonIndex = getSelectedPolygonIndex(editorState);
  const draftDisplayPoints = useMemo(
    () =>
      metrics
        ? editorState.draftPoints.map((point) => imagePointToDisplay(point, metrics))
        : [],
    [editorState.draftPoints, metrics]
  );
  const canInspectImage = Boolean(metrics && resolvedImageUrl);
  const canCloseDraft = canCloseDraftPolygon(editorState, minPoints);
  const hasDraft = hasDraftPoints(editorState);
  const interactionActive = Boolean(editorState.interaction);
  const canUndoHistory = canUndoEditorChange(editorState) && !interactionActive;
  const canRedoHistory = canRedoEditorChange(editorState) && !interactionActive;
  const canMoveSelectedPolygonEarlier =
    selectedPolygonIndex > 0 && !interactionActive;
  const canMoveSelectedPolygonLater =
    selectedPolygonIndex >= 0 &&
    selectedPolygonIndex < editorState.polygons.length - 1 &&
    !interactionActive;
  const selectedPolygonPointCount = selectedPolygon?.points.length ?? 0;
  const canTogglePointRemoval =
    Boolean(selectedPolygon) &&
    selectedPolygonPointCount > minPoints &&
    !interactionActive &&
    !hasDraft;
  const canSubmit =
    Boolean(boot.taskId) &&
    Boolean(resolvedImageUrl) &&
    editorState.polygons.length > 0 &&
    !hasDraft &&
    !isSubmitting;

  const magnifier = useHoverMagnifier({
    active: magnifierEnabled,
    imageUrl: resolvedImageUrl,
    lensMagnification: magnifierLevel,
    metrics,
    resolveDisplayPoint: useCallback((stagePoint, currentMetrics) => {
      const displayPoint = stagePointToViewportDisplayPoint(
        stagePoint,
        DEFAULT_VIEWPORT
      );
      return isViewportDisplayPointInsideImage(displayPoint, currentMetrics)
        ? displayPoint
        : null;
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

  useEffect(() => {
    interactionRef.current = editorState.interaction;
  }, [editorState.interaction]);

  useEffect(() => {
    metricsRef.current = metrics;
  }, [metrics]);

  useEffect(() => {
    dispatch({ type: 'reset' });
    interactionRef.current = null;
    setDraftClosePreviewActive(false);
    setPointRemovalModeActive(false);
    resetSubmissionFeedback();
    setEditorFeedback(DEFAULT_FEEDBACK);
  }, [bundle?.task.id, resetSubmissionFeedback]);

  useEffect(() => {
    if (!editorState.draftPoints.length || editorState.interaction) {
      setDraftClosePreviewActive(false);
    }
  }, [editorState.draftPoints.length, editorState.interaction]);

  useEffect(() => {
    if (
      pointRemovalModeActive &&
      (!selectedPolygon ||
        selectedPolygon.points.length <= minPoints ||
        interactionActive ||
        hasDraft)
    ) {
      setPointRemovalModeActive(false);
    }
  }, [
    hasDraft,
    interactionActive,
    minPoints,
    pointRemovalModeActive,
    selectedPolygon
  ]);

  const focusStage = useCallback(() => {
    stageRef.current?.focus();
  }, []);

  const getStagePoint = useCallback(({ clientX, clientY }: ClientPoint) => {
    const stageRect = stageRef.current?.getBoundingClientRect();
    if (!stageRect) {
      return null;
    }

    return {
      x: clientX - stageRect.left,
      y: clientY - stageRect.top
    };
  }, []);

  const getDisplayPointFromClient = useCallback(
    (clientPoint: ClientPoint) => {
      const stagePoint = getStagePoint(clientPoint);
      return stagePoint
        ? stagePointToViewportDisplayPoint(stagePoint, DEFAULT_VIEWPORT)
        : null;
    },
    [getStagePoint]
  );

  const getImagePointFromClient = useCallback(
    (
      clientPoint: ClientPoint,
      options: { clampToImage?: boolean; requireInside?: boolean } = {}
    ) => {
      const currentMetrics = metricsRef.current;
      const stagePoint = getStagePoint(clientPoint);
      if (!currentMetrics || !stagePoint) {
        return null;
      }

      const viewportDisplayPoint = stagePointToViewportDisplayPoint(
        stagePoint,
        DEFAULT_VIEWPORT
      );
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

  const selectPolygon = useCallback(
    (polygon: DisplayPolygon, message: string) => {
      dispatch({ type: 'select_polygon', polygonId: polygon.id });
      setPointRemovalModeActive(false);
      focusStage();
      setFeedback({
        tone: 'neutral',
        label: 'Selection',
        message
      });
    },
    [focusStage, setFeedback]
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

  const resetDraft = useCallback(
    (message: string) => {
      if (!editorState.draftPoints.length) {
        return;
      }

      dispatch({ type: 'reset_draft' });
      setDraftClosePreviewActive(false);
      setFeedback({
        tone: 'neutral',
        label: 'Draft cleared',
        message
      });
    },
    [editorState.draftPoints.length, setFeedback]
  );

  const clearAllPolygons = useCallback(
    (message: string) => {
      dispatch({ type: 'clear_all' });
      interactionRef.current = null;
      setDraftClosePreviewActive(false);
      setPointRemovalModeActive(false);
      setFeedback({
        tone: 'neutral',
        label: 'Editor',
        message
      });
    },
    [setFeedback]
  );

  const closeDraft = useCallback(() => {
    if (!canCloseDraft) {
      return;
    }

    const nextPolygonIndex = editorState.polygons.length;
    dispatch({
      type: 'close_draft',
      polygonId: createPolygonId(),
      label: SALIENT_OBJECT_LABEL
    });
    setDraftClosePreviewActive(false);
    setFeedback({
      tone: 'neutral',
      label: 'Polygon closed',
      message: `${formatPolygonName(nextPolygonIndex)} closed. Click anywhere on the image to start another polygon.`
    });
  }, [canCloseDraft, editorState.polygons.length, setFeedback]);

  const undoLastDraftPoint = useCallback(() => {
    if (!editorState.draftPoints.length) {
      return;
    }

    dispatch({ type: 'undo_draft_point' });
    setDraftClosePreviewActive(false);
    setFeedback({
      tone: 'neutral',
      label: 'Draft',
      message: 'Removed the last draft vertex.'
    });
  }, [editorState.draftPoints.length, setFeedback]);

  const deleteSelectedPolygon = useCallback(() => {
    if (!editorState.selectedPolygonId) {
      return;
    }

    dispatch({ type: 'delete_selected_polygon' });
    setFeedback({
      tone: 'neutral',
      label: 'Delete',
      message:
        selectedPolygonIndex >= 0
          ? `${formatPolygonName(selectedPolygonIndex)} removed.`
          : 'Selected polygon removed.'
    });
  }, [editorState, selectedPolygonIndex, setFeedback]);

  const moveSelectedPolygon = useCallback(
    (direction: -1 | 1) => {
      if (!editorState.selectedPolygonId || selectedPolygonIndex < 0) {
        return;
      }

      const nextIndex = selectedPolygonIndex + direction;
      if (nextIndex < 0 || nextIndex >= editorState.polygons.length) {
        return;
      }

      dispatch({
        type: 'move_polygon',
        polygonId: editorState.selectedPolygonId,
        targetIndex: nextIndex
      });
      focusStage();
      setFeedback({
        tone: 'neutral',
        label: 'Polygon order',
        message: `Moved Object ${selectedPolygonIndex + 1} to position ${nextIndex + 1}.`
      });
    },
    [
      editorState.polygons.length,
      editorState.selectedPolygonId,
      focusStage,
      selectedPolygonIndex,
      setFeedback
    ]
  );

  const insertPolygonVertex = useCallback(
    (polygon: DisplayPolygon, afterVertexIndex: number) => {
      const point = getPolygonInsertPoint(polygon, afterVertexIndex);
      if (!point) {
        return;
      }

      dispatch({
        type: 'insert_polygon_vertex',
        polygonId: polygon.id,
        afterVertexIndex,
        point
      });
      focusStage();
      setFeedback({
        tone: 'neutral',
        label: 'Point inserted',
        message: `Added vertex ${afterVertexIndex + 2} to ${formatPolygonName(polygon.index)}. Drag it to refine the edge if needed.`
      });
    },
    [focusStage, setFeedback]
  );

  const togglePointRemovalMode = useCallback(() => {
    if (!selectedPolygon || !canTogglePointRemoval) {
      return;
    }

    const nextMode = !pointRemovalModeActive;
    setPointRemovalModeActive(nextMode);
    focusStage();
    setFeedback({
      tone: 'neutral',
      label: 'Point removal',
      message: nextMode
        ? `Click a vertex on ${formatPolygonName(selectedPolygon.index)} to remove it. anno-lab keeps at least ${minPoints} points per polygon.`
        : 'Point removal canceled.'
    });
  }, [
    canTogglePointRemoval,
    focusStage,
    minPoints,
    pointRemovalModeActive,
    selectedPolygon,
    setFeedback
  ]);

  const undoEditorChange = useCallback(() => {
    if (!canUndoHistory) {
      return;
    }

    dispatch({ type: 'undo' });
    setDraftClosePreviewActive(false);
    setFeedback({
      tone: 'neutral',
      label: 'Undo',
      message: 'Reverted the last polygon edit.'
    });
  }, [canUndoHistory, setFeedback]);

  const redoEditorChange = useCallback(() => {
    if (!canRedoHistory) {
      return;
    }

    dispatch({ type: 'redo' });
    setDraftClosePreviewActive(false);
    setFeedback({
      tone: 'neutral',
      label: 'Redo',
      message: 'Restored the reverted polygon edit.'
    });
  }, [canRedoHistory, setFeedback]);

  const handleOverlayClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      focusStage();
      if (!metricsRef.current || bundleError || !resolvedImageUrl) {
        return;
      }

      const displayPoint = getDisplayPointFromClient(event);
      if (!displayPoint) {
        return;
      }

      if (pointRemovalModeActive) {
        setFeedback({
          tone: 'warning',
          label: 'Point removal',
          message:
            'Point removal is armed. Click a polygon vertex to delete it or press Escape to cancel.'
        });
        return;
      }

      if (canCloseDraft && isNearFirstDraftVertex(displayPoint, draftDisplayPoints)) {
        closeDraft();
        return;
      }

      const imagePoint = getImagePointFromClient(event, { requireInside: true });
      if (!imagePoint) {
        return;
      }

      dispatch({ type: 'append_draft_point', point: imagePoint });
      setDraftClosePreviewActive(false);
      setFeedback({
        tone: 'neutral',
        label: 'Draft',
        message: `Vertex ${editorState.draftPoints.length + 1} recorded for ${formatPolygonName(editorState.polygons.length)}.`
      });
    },
    [
      bundleError,
      canCloseDraft,
      closeDraft,
      draftDisplayPoints,
      editorState,
      focusStage,
      getDisplayPointFromClient,
      getImagePointFromClient,
      pointRemovalModeActive,
      resolvedImageUrl,
      setFeedback
    ]
  );

  const handleClosedVertexMouseDown = useCallback(
    (
      event: ReactMouseEvent<SVGCircleElement>,
      polygon: DisplayPolygon,
      vertexIndex: number
    ) => {
      if (event.button !== 0) {
        return;
      }

      event.stopPropagation();
      focusStage();

      if (pointRemovalModeActive) {
        if (!selectedPolygon || polygon.id !== selectedPolygon.id) {
          setFeedback({
            tone: 'warning',
            label: 'Point removal',
            message: selectedPolygon
              ? `Point removal is armed for ${formatPolygonName(selectedPolygon.index)}. Select ${formatPolygonName(polygon.index)} first if you want to edit it.`
              : 'Point removal is armed for the selected polygon. Re-select the polygon you want to edit or press Escape to cancel.'
          });
          return;
        }

        setPointRemovalModeActive(false);
        if (polygon.points.length <= minPoints) {
          setFeedback({
            tone: 'warning',
            label: 'Point removal',
            message: `${formatPolygonName(polygon.index)} must keep at least ${minPoints} vertices.`
          });
          return;
        }

        dispatch({
          type: 'remove_polygon_vertex',
          polygonId: polygon.id,
          vertexIndex,
          minimumPoints: minPoints
        });
        setFeedback({
          tone: 'neutral',
          label: 'Point removed',
          message: `Removed vertex ${vertexIndex + 1} from ${formatPolygonName(polygon.index)}.`
        });
        return;
      }

      dispatch({
        type: 'start_dragging_vertex',
        drag: {
          polygonId: polygon.id,
          polygonIndex: polygon.index,
          vertexIndex
        }
      });
      setDraftClosePreviewActive(false);
      setFeedback({
        tone: 'neutral',
        label: 'Vertex drag',
        message: `Dragging ${formatPolygonName(polygon.index)} vertex ${vertexIndex + 1}.`
      });
    },
    [
      focusStage,
      minPoints,
      pointRemovalModeActive,
      selectedPolygon,
      setFeedback
    ]
  );

  const handleInteractionMove = useCallback(
    (event: MouseEvent) => {
      const currentInteraction = interactionRef.current;
      if (!currentInteraction) {
        return;
      }

      const imagePoint = getImagePointFromClient(event, { clampToImage: true });
      if (!imagePoint) {
        return;
      }

      dispatch({ type: 'update_dragging_vertex', point: imagePoint });
    },
    [getImagePointFromClient]
  );

  const handleInteractionEnd = useCallback(() => {
    const currentInteraction = interactionRef.current;
    if (!currentInteraction) {
      return;
    }

    interactionRef.current = null;
    dispatch({ type: 'clear_interaction' });
    setFeedback({
      tone: 'neutral',
      label: 'Vertex updated',
      message: `${formatPolygonName(currentInteraction.polygonIndex)} vertex ${currentInteraction.vertexIndex + 1} moved.`
    });
  }, [setFeedback]);

  useEffect(() => {
    if (!editorState.interaction) {
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
  }, [editorState.interaction, handleInteractionEnd, handleInteractionMove]);

  const handleStageMouseMove = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      magnifier.updateFromClientPoint(event);

      if (!canCloseDraft || interactionRef.current) {
        setDraftClosePreviewActive(false);
        return;
      }

      const displayPoint = getDisplayPointFromClient(event);
      if (!displayPoint) {
        setDraftClosePreviewActive(false);
        return;
      }

      setDraftClosePreviewActive(
        isNearFirstDraftVertex(displayPoint, draftDisplayPoints)
      );
    },
    [
      canCloseDraft,
      draftDisplayPoints,
      getDisplayPointFromClient,
      magnifier
    ]
  );

  const handleStageMouseLeave = useCallback(() => {
    magnifier.clear();
    setDraftClosePreviewActive(false);
  }, [magnifier]);

  const handleCanvasPolygonSelect = useCallback(
    (polygon: DisplayPolygon) => {
      selectPolygon(
        polygon,
        `${formatPolygonName(polygon.index)} selected from the canvas.`
      );
    },
    [selectPolygon]
  );

  const handleRailPolygonSelect = useCallback(
    (polygon: DisplayPolygon) => {
      selectPolygon(
        polygon,
        `${formatPolygonName(polygon.index)} selected from the object rail.`
      );
    },
    [selectPolygon]
  );

  const handleStageMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      focusStage();
      if (event.button !== 0 || event.target !== event.currentTarget) {
        return;
      }
    },
    [focusStage]
  );

  const handleOverlayMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      focusStage();
      if (event.button !== 0 || !metricsRef.current || !resolvedImageUrl) {
        return;
      }
    },
    [focusStage, resolvedImageUrl]
  );

  useHotkeys({
    scopeRef: stageRef,
    onKeyDown: (event) => {
      const key = event.key.toLowerCase();
      const isHistoryShortcut = event.metaKey || event.ctrlKey;

      if (isHistoryShortcut && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redoEditorChange();
        } else {
          undoEditorChange();
        }
      } else if (isHistoryShortcut && key === 'y') {
        event.preventDefault();
        redoEditorChange();
      } else if (key === 'm') {
        event.preventDefault();
        handleToggleMagnifier();
      } else if (event.key === 'Enter') {
        if (canCloseDraft) {
          event.preventDefault();
          closeDraft();
        }
      } else if (event.key === 'Backspace') {
        if (editorState.draftPoints.length > 0) {
          event.preventDefault();
          undoLastDraftPoint();
        }
      } else if (event.key === 'Delete') {
        if (editorState.selectedPolygonId) {
          event.preventDefault();
          deleteSelectedPolygon();
        }
      } else if (key === 'r') {
        if (editorState.draftPoints.length > 0) {
          event.preventDefault();
          resetDraft('Draft polygon reset. Start outlining again.');
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        if (interactionRef.current) {
          interactionRef.current = null;
          dispatch({ type: 'cancel_interaction' });
          setFeedback({
            tone: 'neutral',
            label: 'Vertex drag',
            message: 'Canceled the current vertex move.'
          });
        } else if (pointRemovalModeActive) {
          setPointRemovalModeActive(false);
          setFeedback({
            tone: 'neutral',
            label: 'Point removal',
            message: 'Point removal canceled.'
          });
        } else if (editorState.selectedPolygonId) {
          dispatch({ type: 'select_polygon', polygonId: null });
          setFeedback({
            tone: 'neutral',
            label: 'Selection',
            message: 'Selection cleared.'
          });
        } else if (editorState.draftPoints.length > 0) {
          resetDraft('Draft polygon cleared.');
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
          objects: buildPolygonSubmissionObjects(editorState.polygons)
        },
        schemaVersion: RESULT_SCHEMA_VERSION,
        toolVersion: TOOL_VERSION,
        rawPayload: {
          source: 'salient-poly',
          ui: {
            object_count: editorState.polygons.length,
            draft_vertex_count: editorState.draftPoints.length,
            selected_polygon_id: editorState.selectedPolygonId
          }
        },
        successMessage: 'Polygons submitted successfully.'
      });
    } catch {
      // Submission feedback is handled inside the shared hook.
    }
  }, [canSubmit, editorState, submit]);

  const workspaceMessage = bundleError
    ? bundleError
    : loading
      ? 'Loading task bundle…'
      : !resolvedImageUrl
        ? 'Task asset delivery is not configured for this task.'
        : !metrics
          ? 'Loading image…'
          : '';

  const activeFeedback =
    submissionFeedback.tone === 'neutral' ? editorFeedback : submissionFeedback;

  const toasts: ToastMessage[] =
    submissionFeedback.tone === 'neutral'
      ? []
      : [
          {
            id: `submit-${submissionFeedback.tone}`,
            tone: submissionFeedback.tone,
            title: submissionFeedback.label || 'anno-lab',
            message: submissionFeedback.message
          }
        ];

  const taskSnapshot = bundle as TaskBundle<SalientDefinition> | null;
  const canResetAll = editorState.polygons.length > 0 || editorState.draftPoints.length > 0;

  return (
    <WorkspaceShell
      eyebrow="anno-lab · Salient Polygon"
      title="Trace salient objects with polygons"
      subtitle={instructionText}
      shortcuts={SHORTCUTS}
      toasts={toasts}
      toolbar={
        <>
          <div className="anno-lab-toolbar-group" data-toolbar-group="mode" role="group" aria-label="Editor mode controls">
            <button
              className="anno-lab-button anno-lab-button--ghost"
              type="button"
              onClick={focusStage}
            >
              Focus editor
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
              disabled={!canUndoHistory}
            >
              Undo
            </button>
            <button
              className="anno-lab-button anno-lab-button--ghost"
              type="button"
              onClick={redoEditorChange}
              disabled={!canRedoHistory}
            >
              Redo
            </button>
          </div>
          <div className="anno-lab-toolbar-group" data-toolbar-group="annotation" role="group" aria-label="Annotation actions">
            <button
              className="anno-lab-button anno-lab-button--ghost"
              type="button"
              onClick={closeDraft}
              disabled={!canCloseDraft}
            >
              Close polygon
            </button>
            <button
              className="anno-lab-button anno-lab-button--ghost"
              type="button"
              onClick={() => resetDraft('Draft polygon reset. Start outlining again.')}
              disabled={!editorState.draftPoints.length}
            >
              Reset draft
            </button>
            <button
              className="anno-lab-button anno-lab-button--danger"
              type="button"
              onClick={deleteSelectedPolygon}
              disabled={!selectedPolygon}
            >
              Delete selected
            </button>
            <button
              className="anno-lab-button anno-lab-button--danger"
              type="button"
              onClick={() => clearAllPolygons('All polygons cleared.')}
              disabled={!canResetAll}
            >
              Clear all
            </button>
          </div>
        </>
      }
      leftRail={
        <SalientTaskRail
          instructionText={instructionText}
          resolvedImageUrl={resolvedImageUrl}
          taskSnapshot={taskSnapshot}
        />
      }
      rightRail={
        <SalientAnnotationRail
          canMoveSelectedPolygonEarlier={canMoveSelectedPolygonEarlier}
          canMoveSelectedPolygonLater={canMoveSelectedPolygonLater}
          canTogglePointRemoval={canTogglePointRemoval}
          canResetAll={canResetAll}
          canSubmit={canSubmit}
          displayPolygons={displayPolygons}
          draftClosePreviewActive={draftClosePreviewActive}
          draftPointsCount={editorState.draftPoints.length}
          isSubmitting={isSubmitting}
          minPoints={minPoints}
          onClearAll={() => clearAllPolygons('All polygons cleared.')}
          onMoveSelectedPolygonEarlier={() => moveSelectedPolygon(-1)}
          onMoveSelectedPolygonLater={() => moveSelectedPolygon(1)}
          onSelectPolygon={handleRailPolygonSelect}
          onSubmit={handleSubmit}
          onTogglePointRemoval={togglePointRemovalMode}
          pointRemovalModeActive={pointRemovalModeActive}
          selectedPolygon={selectedPolygon}
          selectedPolygonId={editorState.selectedPolygonId}
        />
      }
      footer={
        <StatusFooter
          feedback={activeFeedback}
          meta={[
            { label: 'Objects', value: String(editorState.polygons.length) },
            { label: 'Draft', value: String(editorState.draftPoints.length) },
            { label: 'View', value: 'Fit' },
            { label: 'Lens', value: formatMagnificationLabel(magnifierLevel) },
            {
              label: 'Selection',
              value: selectedPolygon ? formatPolygonName(selectedPolygon.index) : 'None'
            },
            { label: 'Schema', value: RESULT_SCHEMA_VERSION },
            { label: 'Mode', value: 'Edit' }
          ]}
          shortcuts={SHORTCUTS}
        />
      }
    >
      <SalientCanvas
        canCloseDraft={canCloseDraft}
        draftClosePreviewActive={draftClosePreviewActive}
        draftDisplayPoints={draftDisplayPoints}
        displayPolygons={displayPolygons}
        imageRef={imageRef}
        interaction={editorState.interaction}
        magnifierCrosshair={magnifier.crosshair}
        magnifierLens={magnifier.lens}
        onClosedVertexMouseDown={handleClosedVertexMouseDown}
        onInsertVertex={insertPolygonVertex}
        onOverlayMouseDown={handleOverlayMouseDown}
        onOverlayClick={handleOverlayClick}
        onPolygonSelect={handleCanvasPolygonSelect}
        onStageMouseDown={handleStageMouseDown}
        onStageMouseLeave={handleStageMouseLeave}
        onStageMouseMove={handleStageMouseMove}
        pointRemovalModeActive={pointRemovalModeActive}
        refreshMetrics={refreshMetrics}
        resolvedImageUrl={resolvedImageUrl}
        selectedPolygonId={editorState.selectedPolygonId}
        stageRef={stageRef}
        workspaceMessage={workspaceMessage}
      />
    </WorkspaceShell>
  );
};

export default App;
