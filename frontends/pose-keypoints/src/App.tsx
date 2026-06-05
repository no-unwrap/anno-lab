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
  DisplayPoint,
  FeedbackState,
  ImagePoint,
  MagnifierLevel
} from '@anno-lab/shared';

import {
  DEFAULT_FEEDBACK,
  RESULT_SCHEMA_VERSION,
  SHORTCUTS,
  TEST_JPG_URL,
  TOOL_VERSION
} from './constants';
import {
  normalizeLandmarks,
  normalizeSkeleton,
  resolveInstructionText,
  resolveSubjectLabel
} from './poseDefinition';
import {
  clampKeypointPoint,
} from './poseInteractions';
import {
  applyLandmarkPlacement,
  applySelectedKeypointState,
  canRedoPoseEditorChange,
  canUndoPoseEditorChange,
  createPoseEditorState,
  getKeypointById,
  getNextPendingLandmarkId,
  getSelectedKeypoint,
  getSelectionStepTarget,
  getStatusLabel,
  isResolved,
  poseEditorReducer,
  type PoseEditorState
} from './poseState';
import { PoseCanvas } from './components/PoseCanvas';
import { PoseLandmarkRail } from './components/PoseLandmarkRail';
import { PoseTaskRail } from './components/PoseTaskRail';
import type {
  ClientPoint,
  Keypoint,
  KeypointState,
  PoseDefinition,
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
  const { bundle, error: bundleError, loading } = useTaskBundle<PoseDefinition>({
    taskId: boot.taskId,
    apiBase: boot.apiBase
  });
  const definition = bundle?.task_definition.definition ?? {};
  const landmarks = useMemo(
    () => normalizeLandmarks(definition.landmarks),
    [definition.landmarks]
  );
  const skeleton = useMemo(
    () => normalizeSkeleton(definition.skeleton, landmarks),
    [definition.skeleton, landmarks]
  );
  const subjectLabel = resolveSubjectLabel(definition);
  const instructionText = resolveInstructionText(definition);
  const resolvedImageUrl = bundle?.asset_url ?? (!boot.taskId ? TEST_JPG_URL : undefined);

  const [editorState, dispatch] = useReducer(
    poseEditorReducer,
    landmarks,
    createPoseEditorState
  );
  const [magnifierEnabled, setMagnifierEnabled] = useState(false);
  const [magnifierLevel, setMagnifierLevel] =
    useState<MagnifierLevel>(DEFAULT_MAGNIFIER_LEVEL);
  const [editorFeedback, setEditorFeedback] =
    useState<FeedbackState>(DEFAULT_FEEDBACK);

  const imageRef = useRef<HTMLImageElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const editorStateRef = useRef<PoseEditorState>(editorState);

  const { metrics, refreshMetrics } = useImageStageMetrics({
    imageRef,
    fallbackNaturalWidth: bundle?.asset.width,
    fallbackNaturalHeight: bundle?.asset.height
  });
  const metricsRef = useRef(metrics);
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

  const selectedKeypoint = getSelectedKeypoint(editorState);
  const interactionActive = editorState.interaction !== null;
  const resolvedCount = editorState.keypoints.filter((keypoint) =>
    isResolved(keypoint.state)
  ).length;
  const visibleCount = editorState.keypoints.filter(
    (keypoint) => keypoint.state === 'visible'
  ).length;
  const occludedCount = editorState.keypoints.filter(
    (keypoint) => keypoint.state === 'occluded'
  ).length;
  const pendingCount = editorState.keypoints.filter(
    (keypoint) => keypoint.state === 'pending'
  ).length;
  const canSubmit =
    Boolean(boot.taskId) &&
    Boolean(editorState.keypoints.length) &&
    pendingCount === 0 &&
    !isSubmitting;
  const canInspectImage = Boolean(metrics && resolvedImageUrl);
  const canUndoHistory = canUndoPoseEditorChange(editorState) && !interactionActive;
  const canRedoHistory = canRedoPoseEditorChange(editorState) && !interactionActive;

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
    metricsRef.current = metrics;
  }, [metrics]);

  useEffect(() => {
    editorStateRef.current = editorState;
  }, [editorState]);

  useEffect(() => {
    dispatch({ type: 'reset', landmarks });
    resetSubmissionFeedback();
    setEditorFeedback(DEFAULT_FEEDBACK);
  }, [bundle?.task.id, landmarks, resetSubmissionFeedback]);

  const focusStage = useCallback(() => {
    stageRef.current?.focus();
  }, []);

  const setModeWithFeedback = useCallback(
    (nextMode: ToolMode) => {
      dispatch({ type: 'set_mode', mode: nextMode });
      setFeedback({
        tone: 'neutral',
        label: 'Mode',
        message:
          nextMode === 'place'
            ? 'Place mode active.'
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

  const getStagePoint = useCallback(
    ({ clientX, clientY }: ClientPoint): DisplayPoint | null => {
      if (!stageRef.current) {
        return null;
      }

      const rect = stageRef.current.getBoundingClientRect();
      return {
        x: clientX - rect.left,
        y: clientY - rect.top
      };
    },
    []
  );

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

      return stagePointToImagePoint(
        stagePoint,
        currentMetrics,
        DEFAULT_VIEWPORT,
        { clampToImage: options.clampToImage }
      );
    },
    [getStagePoint]
  );

  const selectLandmark = useCallback(
    (landmarkId: string, message: string) => {
      dispatch({ type: 'select', landmarkId });
      focusStage();
      setFeedback({
        tone: 'neutral',
        label: 'Selection',
        message
      });
    },
    [focusStage, setFeedback]
  );

  const moveSelection = useCallback(
    (step: number) => {
      const nextLandmark = getSelectionStepTarget(
        editorState.keypoints,
        editorState.selectedLandmarkId,
        step
      );
      if (!nextLandmark) {
        return;
      }

      dispatch({ type: 'move_selection', step });
      focusStage();
      setFeedback({
        tone: 'neutral',
        label: 'Selection',
        message: `${nextLandmark.label} selected from the ordered landmark list.`
      });
    },
    [
      editorState.keypoints,
      editorState.selectedLandmarkId,
      focusStage,
      setFeedback
    ]
  );

  const placeLandmark = useCallback(
    (
      landmarkId: string,
      imagePoint: ImagePoint,
      options: { autoAdvance?: boolean } = {}
    ) => {
      const currentKeypoint = getKeypointById(editorState.keypoints, landmarkId);
      if (!currentKeypoint) {
        return;
      }

      const previewState = applyLandmarkPlacement(
        editorState,
        landmarkId,
        imagePoint,
        options
      );
      const nextLandmark = getSelectedKeypoint(previewState);

      dispatch({
        type: 'place_landmark',
        landmarkId,
        point: imagePoint,
        autoAdvance: options.autoAdvance
      });
      focusStage();
      setFeedback({
        tone: 'neutral',
        label: 'Landmark placed',
        message:
          nextLandmark && nextLandmark.landmarkId !== landmarkId
            ? `${currentKeypoint.label} placed. Next landmark: ${nextLandmark.label}.`
            : `${currentKeypoint.label} placed.`
      });
    },
    [editorState, focusStage, setFeedback]
  );

  const handleSelectedKeypointState = useCallback(
    (nextState: KeypointState) => {
      if (!selectedKeypoint) {
        return;
      }

      if (
        (nextState === 'visible' || nextState === 'occluded') &&
        !selectedKeypoint.point
      ) {
        setFeedback({
          tone: 'warning',
          label: 'Coordinates required',
          message: `Place ${selectedKeypoint.label} in the canvas before marking it ${getStatusLabel(nextState).toLowerCase()}.`
        });
        return;
      }

      const previewState = applySelectedKeypointState(editorState, nextState);
      const nextLandmark = getSelectedKeypoint(previewState);

      dispatch({ type: 'set_selected_state', state: nextState });
      focusStage();
      setFeedback({
        tone: 'neutral',
        label: 'Visibility',
        message:
          nextState === 'not_in_frame' &&
          nextLandmark &&
          nextLandmark.landmarkId !== selectedKeypoint.landmarkId
            ? `${selectedKeypoint.label} marked as not in frame. Next landmark: ${nextLandmark.label}.`
            : `${selectedKeypoint.label} marked as ${getStatusLabel(nextState).toLowerCase()}.`
      });
    },
    [editorState, focusStage, selectedKeypoint, setFeedback]
  );

  const clearSelectedKeypoint = useCallback(() => {
    if (!selectedKeypoint) {
      return;
    }

    dispatch({ type: 'clear_selected' });
    focusStage();
    setFeedback({
      tone: 'neutral',
      label: 'Cleared',
      message: `${selectedKeypoint.label} reset to pending.`
    });
  }, [focusStage, selectedKeypoint, setFeedback]);

  const undoEditorChange = useCallback(() => {
    if (!canUndoHistory) {
      return;
    }

    dispatch({ type: 'undo' });
    focusStage();
    setFeedback({
      tone: 'neutral',
      label: 'Undo',
      message: 'Reverted the last keypoint edit.'
    });
  }, [canUndoHistory, focusStage, setFeedback]);

  const redoEditorChange = useCallback(() => {
    if (!canRedoHistory) {
      return;
    }

    dispatch({ type: 'redo' });
    focusStage();
    setFeedback({
      tone: 'neutral',
      label: 'Redo',
      message: 'Restored the reverted keypoint edit.'
    });
  }, [canRedoHistory, focusStage, setFeedback]);

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

      if (editorState.mode === 'select') {
        dispatch({ type: 'select', landmarkId: null });
        setFeedback({
          tone: 'neutral',
          label: 'Selection',
          message: 'No landmark selected.'
        });
      }
    },
    [editorState.mode, focusStage, resolvedImageUrl, setFeedback]
  );

  const handleOverlayMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      focusStage();
      if (event.button !== 0 || !metricsRef.current || !resolvedImageUrl) {
        return;
      }

      if (event.target !== event.currentTarget) {
        return;
      }

      if (editorState.mode === 'select') {
        dispatch({ type: 'select', landmarkId: null });
        setFeedback({
          tone: 'neutral',
          label: 'Selection',
          message: 'No landmark selected.'
        });
        return;
      }

      const landmarkIdToPlace =
        editorState.selectedLandmarkId ??
        getNextPendingLandmarkId(editorState.keypoints);
      if (!landmarkIdToPlace) {
        return;
      }

      const imagePoint = getImagePointFromClient(event, { requireInside: true });
      if (!imagePoint) {
        return;
      }

      placeLandmark(landmarkIdToPlace, imagePoint);
    },
    [
      editorState.keypoints,
      editorState.mode,
      editorState.selectedLandmarkId,
      focusStage,
      getImagePointFromClient,
      placeLandmark,
      resolvedImageUrl,
      setFeedback
    ]
  );

  const handleKeypointMouseDown = useCallback(
    (event: ReactMouseEvent<SVGCircleElement>, keypoint: Keypoint) => {
      if (event.button !== 0) {
        return;
      }

      event.stopPropagation();
      focusStage();

      const imagePoint = getImagePointFromClient(event, { clampToImage: true });
      if (!imagePoint) {
        return;
      }

      dispatch({
        type: 'start_dragging',
        landmarkId: keypoint.landmarkId,
        point: imagePoint,
        state: keypoint.state === 'occluded' ? 'occluded' : 'visible'
      });
      setFeedback({
        tone: 'neutral',
        label: 'Selection',
        message: `${keypoint.label} selected from the canvas.`
      });
    },
    [focusStage, getImagePointFromClient, setFeedback]
  );

  const handleInteractionMove = useCallback(
    (clientPoint: ClientPoint) => {
      const currentInteraction = editorStateRef.current.interaction;
      if (!currentInteraction) {
        return;
      }

      const imagePoint = getImagePointFromClient(clientPoint, { clampToImage: true });
      if (!imagePoint) {
        return;
      }

      const currentMetrics = metricsRef.current;
      dispatch({
        type: 'update_dragging',
        point: currentMetrics
          ? clampKeypointPoint(imagePoint, {
              width: currentMetrics.naturalWidth,
              height: currentMetrics.naturalHeight
            })
          : imagePoint
      });
    },
    [getImagePointFromClient]
  );

  const handleInteractionEnd = useCallback(() => {
    const currentInteraction = editorStateRef.current.interaction;
    if (!currentInteraction) {
      return;
    }

    if (currentInteraction.type === 'dragging') {
      const movedKeypoint = getKeypointById(
        editorStateRef.current.keypoints,
        currentInteraction.landmarkId
      );
      if (movedKeypoint) {
        setFeedback({
          tone: 'neutral',
          label: 'Landmark moved',
          message: `${movedKeypoint.label} repositioned in image coordinates.`
        });
      }
    }

    dispatch({ type: 'clear_interaction' });
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

  useHotkeys({
    scopeRef: stageRef,
    onKeyDown: (event) => {
      const lowerKey = event.key.toLowerCase();
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
      } else if (lowerKey === 'k') {
        event.preventDefault();
        setModeWithFeedback('place');
      } else if (lowerKey === 's') {
        event.preventDefault();
        setModeWithFeedback('select');
      } else if (lowerKey === 'm') {
        event.preventDefault();
        handleToggleMagnifier();
      } else if (event.key === '[') {
        event.preventDefault();
        moveSelection(-1);
      } else if (event.key === ']') {
        event.preventDefault();
        moveSelection(1);
      } else if (lowerKey === 'v') {
        event.preventDefault();
        handleSelectedKeypointState('visible');
      } else if (lowerKey === 'o') {
        event.preventDefault();
        handleSelectedKeypointState('occluded');
      } else if (lowerKey === 'n') {
        event.preventDefault();
        handleSelectedKeypointState('not_in_frame');
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedKeypoint) {
          event.preventDefault();
          clearSelectedKeypoint();
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        if (editorState.interaction) {
          dispatch({ type: 'cancel_interaction' });
          setFeedback({
            tone: 'neutral',
            label: 'Canceled',
            message: 'Active interaction canceled.'
          });
        } else {
          dispatch({ type: 'select', landmarkId: null });
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
          subject: {
            type: 'pose_keypoints',
            label: subjectLabel,
            keypoints: editorState.keypoints.map((keypoint) => ({
              id: keypoint.landmarkId,
              label: keypoint.label,
              state: keypoint.state,
              point: keypoint.point
            }))
          }
        },
        schemaVersion: RESULT_SCHEMA_VERSION,
        toolVersion: TOOL_VERSION,
        rawPayload: {
          source: 'pose-keypoints',
          ui: {
            mode: editorState.mode,
            resolved_count: resolvedCount,
            selected_landmark_id: editorState.selectedLandmarkId
          },
          skeleton_edge_count: skeleton.length
        },
        successMessage: 'Pose keypoints submitted successfully.'
      });
    } catch {
      // Shared hook owns error feedback.
    }
  }, [
    canSubmit,
    editorState.keypoints,
    editorState.mode,
    editorState.selectedLandmarkId,
    resolvedCount,
    skeleton.length,
    subjectLabel,
    submit
  ]);

  const activeFeedback =
    submissionFeedback.tone === 'neutral' ? editorFeedback : submissionFeedback;
  const toasts =
    submissionFeedback.tone === 'neutral'
      ? []
      : [
          {
            id: `pose-keypoints-submit-${submissionFeedback.tone}`,
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
      eyebrow="anno-lab · Pose Keypoints"
      title="Annotate one primary person with ordered keypoints"
      subtitle={instructionText}
      shortcuts={SHORTCUTS}
      toasts={toasts}
      toolbar={
        <>
          <div className="anno-lab-toolbar-group" data-toolbar-group="mode" role="group" aria-label="Editor mode controls">
            <button
              className={`anno-lab-button anno-lab-button--ghost ${editorState.mode === 'place' ? 'is-active' : ''}`}
              type="button"
              onClick={() => setModeWithFeedback('place')}
            >
              Place
            </button>
            <button
              className={`anno-lab-button anno-lab-button--ghost ${editorState.mode === 'select' ? 'is-active' : ''}`}
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
          <div className="anno-lab-toolbar-group" data-toolbar-group="selection" role="group" aria-label="Landmark selection controls">
            <button
              className="anno-lab-button anno-lab-button--ghost"
              type="button"
              onClick={() => moveSelection(-1)}
              disabled={!editorState.keypoints.length}
            >
              Previous landmark
            </button>
            <button
              className="anno-lab-button anno-lab-button--ghost"
              type="button"
              onClick={() => moveSelection(1)}
              disabled={!editorState.keypoints.length}
            >
              Next landmark
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
              className="anno-lab-button anno-lab-button--danger"
              type="button"
              onClick={clearSelectedKeypoint}
              disabled={!selectedKeypoint}
            >
              Clear selected
            </button>
            <button
              className="anno-lab-button anno-lab-button--primary"
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
              {isSubmitting ? 'Submitting…' : 'Submit keypoints'}
            </button>
          </div>
        </>
      }
      leftRail={
        <PoseTaskRail
          keypoints={editorState.keypoints}
          resolvedCount={resolvedCount}
          resolvedImageUrl={resolvedImageUrl}
          selectedLandmarkId={editorState.selectedLandmarkId}
          subjectLabel={subjectLabel}
          taskId={bundle?.task.id}
          taskTypeSlug={bundle?.task_type.slug}
        />
      }
      rightRail={
        <PoseLandmarkRail
          keypoints={editorState.keypoints}
          onSelectLandmark={selectLandmark}
          onSetSelectedKeypointState={handleSelectedKeypointState}
          selectedKeypoint={selectedKeypoint}
          selectedLandmarkId={editorState.selectedLandmarkId}
        />
      }
      footer={
        <StatusFooter
          feedback={activeFeedback}
          meta={[
            { label: 'Resolved', value: `${resolvedCount}/${editorState.keypoints.length}` },
            { label: 'Visible', value: String(visibleCount) },
            { label: 'Occluded', value: String(occludedCount) },
            { label: 'View', value: 'Fit' },
            { label: 'Lens', value: formatMagnificationLabel(magnifierLevel) },
            { label: 'Selection', value: selectedKeypoint ? selectedKeypoint.label : 'None' },
            { label: 'Schema', value: RESULT_SCHEMA_VERSION }
          ]}
          shortcuts={SHORTCUTS}
        />
      }
    >
      <PoseCanvas
        imageRef={imageRef}
        keypoints={editorState.keypoints}
        magnifierCrosshair={magnifier.crosshair}
        magnifierLens={magnifier.lens}
        metrics={metrics}
        mode={editorState.mode}
        onKeypointMouseDown={handleKeypointMouseDown}
        onOverlayMouseDown={handleOverlayMouseDown}
        onStageMouseDown={handleStageMouseDown}
        onStageMouseLeave={magnifier.clear}
        onStageMouseMove={magnifier.updateFromClientPoint}
        refreshMetrics={refreshMetrics}
        resolvedImageUrl={resolvedImageUrl}
        selectedKeypoint={selectedKeypoint}
        selectedLandmarkId={editorState.selectedLandmarkId}
        skeleton={skeleton}
        stageRef={stageRef}
        workspaceMessage={workspaceMessage}
      />
    </WorkspaceShell>
  );
};

export default App;
