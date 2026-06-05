import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

import {
  DEFAULT_MAGNIFIER_LEVEL,
  DEFAULT_VIEWPORT,
  EmptyState,
  HoverMagnifier,
  PanelSection,
  StageCrosshair,
  StatusFooter,
  WorkspaceShell,
  formatMagnificationLabel,
  imagePointToDisplay,
  isViewportDisplayPointInsideImage,
  readBootConfig,
  stagePointToImagePoint,
  stagePointToViewportDisplayPoint,
  useAnnotationSubmit,
  useHoverMagnifier,
  useHotkeys,
  useImageStageMetrics,
  useTaskBundle
} from '@anno-lab/shared';
import type {
  FeedbackState,
  ImagePoint,
  MagnifierLevel,
  TaskPreAnnotationPolygon,
  ToastMessage
} from '@anno-lab/shared';

import {
  DEFAULT_FEEDBACK,
  DIFFICULTY_OPTIONS,
  MAX_SIGNAL_PROMPTS,
  OVERWHELM_OPTIONS,
  RESULT_SCHEMA_VERSION,
  SHORTCUTS,
  TEST_JPG_URL,
  TOOL_VERSION
} from './constants';
import {
  type SalientTbiDefinition,
  resolveInstructionText,
  resolveOverwhelmQuestion,
  resolveSearchDifficultyQuestion
} from './definition';
import { loadSignalSeedPolygon } from './preAnnotations';

type TaskStep = 'mark' | 'report';
type SearchDifficulty = (typeof DIFFICULTY_OPTIONS)[number];
type OverwhelmRating = (typeof OVERWHELM_OPTIONS)[number];
type ProposalState = 'absent' | 'available' | 'accepted' | 'rejected';
type FirstInteractionKind = 'point' | 'accept_proposal' | 'reject_proposal' | 'diffuse_scene';

interface PointTarget {
  kind: 'point';
  label: 'primary_signal_point';
  point: ImagePoint;
}

interface PolygonTarget {
  kind: 'polygon';
  label: 'primary_region';
  points: number[][];
}

interface SceneTarget {
  kind: 'scene';
  label: 'diffuse_scene';
}

type ResultTarget = PointTarget | PolygonTarget | SceneTarget;

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

const serializePolygonPoints = (polygon: TaskPreAnnotationPolygon): number[][] =>
  polygon.points.map((point) => [
    Number(point.x.toFixed(2)),
    Number(point.y.toFixed(2))
  ]);

const describeTarget = (
  target: ResultTarget | null,
  promptCount: number,
  proposalState: ProposalState
): string => {
  if (!target) {
    return 'No selection yet';
  }

  if (target.kind === 'scene') {
    return 'Diffuse scene';
  }

  if (target.kind === 'polygon') {
    return proposalState === 'accepted'
      ? 'Accepted suggested region'
      : 'Polygon region';
  }

  return promptCount > 1 ? 'Adjusted signal point' : 'Signal point selected';
};

const buildSubmissionTarget = (
  proposalState: ProposalState,
  seedPolygon: TaskPreAnnotationPolygon | null,
  promptHistory: ImagePoint[],
  diffuseScene: boolean
): ResultTarget | null => {
  if (diffuseScene) {
    return {
      kind: 'scene',
      label: 'diffuse_scene'
    };
  }

  if (proposalState === 'accepted' && seedPolygon) {
    return {
      kind: 'polygon',
      label: 'primary_region',
      points: serializePolygonPoints(seedPolygon)
    };
  }

  const latestPrompt = promptHistory.at(-1);
  if (!latestPrompt) {
    return null;
  }

  return {
    kind: 'point',
    label: 'primary_signal_point',
    point: latestPrompt
  };
};

const App = () => {
  const boot = readBootConfig();
  const { bundle, error: bundleError, loading } = useTaskBundle<SalientTbiDefinition>({
    taskId: boot.taskId,
    apiBase: boot.apiBase
  });
  const definition = bundle?.task_definition.definition ?? {};
  const instructionText = resolveInstructionText(definition);
  const overwhelmQuestion = resolveOverwhelmQuestion(definition);
  const searchDifficultyQuestion = resolveSearchDifficultyQuestion(definition);
  const resolvedImageUrl = bundle?.asset_url ?? (!boot.taskId ? TEST_JPG_URL : undefined);
  const seedPolygon = useMemo(
    () => (bundle ? loadSignalSeedPolygon(bundle.task.payload) : null),
    [bundle]
  );
  const initialProposalState: ProposalState = seedPolygon ? 'available' : 'absent';

  const [step, setStep] = useState<TaskStep>('mark');
  const [proposalState, setProposalState] = useState<ProposalState>(initialProposalState);
  const [promptHistory, setPromptHistory] = useState<ImagePoint[]>([]);
  const [diffuseScene, setDiffuseScene] = useState(false);
  const [overwhelmRating, setOverwhelmRating] = useState<OverwhelmRating | null>(null);
  const [searchDifficulty, setSearchDifficulty] = useState<SearchDifficulty | null>(null);
  const [magnifierEnabled, setMagnifierEnabled] = useState(false);
  const [magnifierLevel, setMagnifierLevel] =
    useState<MagnifierLevel>(DEFAULT_MAGNIFIER_LEVEL);
  const [editorFeedback, setEditorFeedback] = useState<FeedbackState>(DEFAULT_FEEDBACK);
  const [firstInteractionKind, setFirstInteractionKind] =
    useState<FirstInteractionKind | null>(null);

  const imageRef = useRef<HTMLImageElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const firstInteractionAtRef = useRef<number | null>(null);
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

  useEffect(() => {
    setStep('mark');
    setProposalState(seedPolygon ? 'available' : 'absent');
    setPromptHistory([]);
    setDiffuseScene(false);
    setOverwhelmRating(null);
    setSearchDifficulty(null);
    setEditorFeedback(DEFAULT_FEEDBACK);
    setFirstInteractionKind(null);
    startedAtRef.current = Date.now();
    firstInteractionAtRef.current = null;
    resetSubmissionFeedback();
  }, [resetSubmissionFeedback, seedPolygon, bundle?.task.id]);

  const canInspectImage = Boolean(metrics && resolvedImageUrl);
  const promptCount = promptHistory.length;
  const interactionCapReached = promptCount >= MAX_SIGNAL_PROMPTS;
  const currentTarget = useMemo(
    () => buildSubmissionTarget(proposalState, seedPolygon, promptHistory, diffuseScene),
    [diffuseScene, proposalState, promptHistory, seedPolygon]
  );
  const canAdvanceToReport = currentTarget !== null;
  const requiresSearchDifficulty = currentTarget?.kind !== 'scene';
  const canSubmit =
    Boolean(boot.taskId) &&
    currentTarget !== null &&
    overwhelmRating !== null &&
    (!requiresSearchDifficulty || searchDifficulty !== null) &&
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
    suspended: step !== 'mark'
  });

  const markFirstInteraction = useCallback((kind: FirstInteractionKind) => {
    if (firstInteractionAtRef.current === null) {
      firstInteractionAtRef.current = Date.now();
      setFirstInteractionKind(kind);
    }
  }, []);

  const setFeedback = useCallback(
    (nextFeedback: FeedbackState) => {
      resetSubmissionFeedback();
      setEditorFeedback(nextFeedback);
    },
    [resetSubmissionFeedback]
  );

  const handleAcceptProposal = useCallback(() => {
    if (!seedPolygon) {
      return;
    }

    markFirstInteraction('accept_proposal');
    setProposalState('accepted');
    setPromptHistory([]);
    setDiffuseScene(false);
    setFeedback({
      tone: 'success',
      label: 'Suggested region',
      message: 'The suggested region is locked in. Continue when you are ready for the scene questions.'
    });
  }, [markFirstInteraction, seedPolygon, setFeedback]);

  const handleRejectProposal = useCallback(() => {
    if (!seedPolygon) {
      return;
    }

    markFirstInteraction('reject_proposal');
    setProposalState('rejected');
    setDiffuseScene(false);
    setFeedback({
      tone: 'warning',
      label: 'Suggestion dismissed',
      message: 'The suggested region is hidden. Click the scene to place the signal yourself.'
    });
  }, [markFirstInteraction, seedPolygon, setFeedback]);

  const handleDiffuseScene = useCallback(() => {
    markFirstInteraction('diffuse_scene');
    setDiffuseScene(true);
    setProposalState(seedPolygon ? 'rejected' : 'absent');
    setPromptHistory([]);
    setSearchDifficulty(null);
    setFeedback({
      tone: 'warning',
      label: 'Diffuse scene',
      message: 'Recorded as a diffuse scene with no single dominant signal.'
    });
  }, [markFirstInteraction, seedPolygon, setFeedback]);

  const handleOverlayMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!metrics || step !== 'mark' || interactionCapReached) {
        if (interactionCapReached) {
          setFeedback({
            tone: 'warning',
            label: 'Interaction cap reached',
            message:
              'Further clicks are disabled for this task. Continue with the current point or switch to diffuse scene.'
          });
        }
        return;
      }

      const nextPoint = stagePointToImagePoint(
        {
          x: event.clientX - event.currentTarget.getBoundingClientRect().left,
          y: event.clientY - event.currentTarget.getBoundingClientRect().top
        },
        metrics,
        DEFAULT_VIEWPORT,
        { clampToImage: true }
      );

      markFirstInteraction('point');
      setDiffuseScene(false);
      setProposalState(seedPolygon ? 'rejected' : 'absent');
      setPromptHistory((currentHistory) => {
        if (currentHistory.length >= MAX_SIGNAL_PROMPTS) {
          return currentHistory;
        }

        return [...currentHistory, nextPoint];
      });
      setFeedback({
        tone: interactionCapReached || promptCount + 1 >= MAX_SIGNAL_PROMPTS ? 'warning' : 'success',
        label: promptCount === 0 ? 'Point captured' : 'Point updated',
        message:
          promptCount + 1 >= MAX_SIGNAL_PROMPTS
            ? 'This is the last allowed point adjustment for this task.'
            : 'Signal point recorded. You can click again to adjust it before continuing.'
      });
    },
    [
      interactionCapReached,
      markFirstInteraction,
      metrics,
      promptCount,
      seedPolygon,
      setFeedback,
      step
    ]
  );

  const handleContinueToReport = useCallback(() => {
    if (!canAdvanceToReport) {
      return;
    }

    setStep('report');
    setFeedback({
      tone: 'neutral',
      label: 'Scene report',
      message: 'Answer the scene questions, or go back if you want to adjust the signal selection.'
    });
  }, [canAdvanceToReport, setFeedback]);

  const handleBackToMark = useCallback(() => {
    setStep('mark');
    setFeedback({
      tone: 'neutral',
      label: 'Signal step',
      message: 'Adjust the signal selection, then continue when you are ready.'
    });
  }, [setFeedback]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !currentTarget) {
      return;
    }

    const timeToFirstInteractionMs =
      firstInteractionAtRef.current === null
        ? null
        : firstInteractionAtRef.current - startedAtRef.current;
    const timeToSubmitMs = Date.now() - startedAtRef.current;

    try {
      await submit({
        result: {
          mode: 'signal',
          target: currentTarget,
          scene_report: {
            overwhelm_rating: overwhelmRating,
            search_difficulty: currentTarget.kind === 'scene' ? null : searchDifficulty
          }
        },
        schemaVersion: RESULT_SCHEMA_VERSION,
        toolVersion: TOOL_VERSION,
        rawPayload: {
          source: 'salient-tbi',
          ui: {
            step,
            proposal_state: proposalState,
            prompt_count: promptCount,
            target_kind: currentTarget.kind
          },
          interaction: {
            first_interaction_kind: firstInteractionKind,
            initial_positive_point: promptHistory[0] ?? null,
            refinement_prompts: promptHistory.slice(1),
            revision_count: Math.max(promptHistory.length - 1, 0)
          },
          timing: {
            time_to_first_interaction_ms: timeToFirstInteractionMs,
            time_to_submit_ms: timeToSubmitMs
          },
          model: {
            provider: seedPolygon ? 'pre_annotations' : null,
            proposal_available: Boolean(seedPolygon),
            proposal_used: currentTarget.kind === 'polygon',
            accepted_without_edit: proposalState === 'accepted',
            proposal_id: seedPolygon?.id ?? null,
            proposal_score: seedPolygon?.score ?? null
          }
        },
        successMessage: 'Signal annotation submitted successfully.'
      });
    } catch {
      // Shared submission hook owns error feedback.
    }
  }, [
    canSubmit,
    currentTarget,
    firstInteractionKind,
    overwhelmRating,
    promptCount,
    promptHistory,
    proposalState,
    searchDifficulty,
    seedPolygon,
    step,
    submit
  ]);

  useHotkeys({
    scopeRef: stageRef,
    onKeyDown: (event) => {
      const lowerKey = event.key.toLowerCase();

      if (lowerKey === 'm') {
        event.preventDefault();
        setMagnifierEnabled((current) => !current);
      } else if (lowerKey === 'd' && step === 'mark') {
        event.preventDefault();
        handleDiffuseScene();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (step === 'mark') {
          handleContinueToReport();
        } else {
          void handleSubmit();
        }
      } else if (event.key === 'Escape' && step === 'report') {
        event.preventDefault();
        handleBackToMark();
      }
    }
  });

  const activeFeedback =
    submissionFeedback.tone === 'neutral' ? editorFeedback : submissionFeedback;
  const toasts: ToastMessage[] =
    submissionFeedback.tone === 'neutral'
      ? []
      : [
          {
            id: `salient-tbi-submit-${submissionFeedback.tone}`,
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

  const displayPromptPoint =
    metrics && promptHistory.length
      ? imagePointToDisplay(promptHistory[promptHistory.length - 1] as ImagePoint, metrics)
      : null;
  const displaySeedPolygon =
    metrics && seedPolygon ? seedPolygon.points.map((point) => imagePointToDisplay(point, metrics)) : [];
  const seedPolygonPath =
    displaySeedPolygon.length >= 3
      ? displaySeedPolygon.map((point) => `${point.x},${point.y}`).join(' ')
      : '';
  const showSeedPolygon = Boolean(seedPolygon && proposalState !== 'rejected' && seedPolygonPath);
  const targetSummary = describeTarget(currentTarget, promptCount, proposalState);
  const proposalBannerVisible = seedPolygon && step === 'mark' && proposalState !== 'rejected';

  return (
    <WorkspaceShell
      eyebrow="anno-lab · Salient TBI"
      title="Identify the scene’s signal"
      subtitle={instructionText}
      shortcuts={SHORTCUTS}
      toasts={toasts}
      toolbar={
        <>
          <div
            className="anno-lab-toolbar-group"
            data-toolbar-group="step"
            role="group"
            aria-label="Task step controls"
          >
            <button
              className={`anno-lab-button anno-lab-button--ghost ${step === 'mark' ? 'is-active' : ''}`}
              type="button"
              onClick={handleBackToMark}
              disabled={step === 'mark'}
            >
              Step A · Mark signal
            </button>
            <button
              className={`anno-lab-button anno-lab-button--ghost ${step === 'report' ? 'is-active' : ''}`}
              type="button"
              onClick={handleContinueToReport}
              disabled={!canAdvanceToReport}
            >
              Step B · Scene report
            </button>
          </div>
          <div
            className="anno-lab-toolbar-group"
            data-toolbar-group="precision"
            role="group"
            aria-label="Precision controls"
          >
            <button
              className={`anno-lab-button anno-lab-button--ghost ${magnifierEnabled ? 'is-active' : ''}`}
              type="button"
              onClick={() => setMagnifierEnabled((current) => !current)}
              disabled={!canInspectImage}
            >
              <span className="anno-lab-button__label">
                <MagnifierIcon />
                <span>Magnifier</span>
              </span>
            </button>
            {[1.5, 3, 5].map((level) => (
              <button
                key={level}
                className={`anno-lab-button anno-lab-button--ghost ${magnifierLevel === level ? 'is-active' : ''}`}
                type="button"
                onClick={() => setMagnifierLevel(level as MagnifierLevel)}
                disabled={!canInspectImage}
              >
                {formatMagnificationLabel(level)}
              </button>
            ))}
          </div>
        </>
      }
      rightRail={
        <>
          <PanelSection title="Step A · Signal mark" eyebrow="Selection">
            <p className="salient-tbi-panel-copy">{instructionText}</p>
            {proposalBannerVisible ? (
              <div className="salient-tbi-callout salient-tbi-callout--proposal">
                <strong>Suggested region available</strong>
                <p>
                  The highlighted region came from deterministic pre-annotations. Accept it if it matches the signal,
                  or reject it and click the image yourself.
                </p>
                <div className="salient-tbi-inline-actions">
                  <button
                    className="anno-lab-button anno-lab-button--primary"
                    type="button"
                    onClick={handleAcceptProposal}
                    disabled={proposalState === 'accepted'}
                  >
                    Accept region
                  </button>
                  <button
                    className="anno-lab-button anno-lab-button--ghost"
                    type="button"
                    onClick={handleRejectProposal}
                  >
                    Use point instead
                  </button>
                </div>
              </div>
            ) : null}
            {proposalState === 'rejected' || !seedPolygon ? (
              <div className="salient-tbi-callout">
                <strong>Click the signal</strong>
                <p>
                  {interactionCapReached
                    ? 'The click limit is reached. Continue with the current point or switch to diffuse scene.'
                    : `Click the image to place the signal point. You have ${MAX_SIGNAL_PROMPTS - promptCount} click${MAX_SIGNAL_PROMPTS - promptCount === 1 ? '' : 's'} remaining.`}
                </p>
              </div>
            ) : null}
            <div className="salient-tbi-selection-summary" data-testid="selection-summary">
              <strong>{targetSummary}</strong>
              <p>
                {currentTarget?.kind === 'point'
                  ? `Current point: ${currentTarget.point.x}px, ${currentTarget.point.y}px`
                  : currentTarget?.kind === 'polygon'
                    ? 'Suggested region accepted.'
                    : currentTarget?.kind === 'scene'
                      ? 'No single dominant signal could be isolated.'
                      : 'No signal selected yet.'}
              </p>
            </div>
            <div className="salient-tbi-inline-actions">
              <button
                className="anno-lab-button anno-lab-button--danger"
                type="button"
                onClick={handleDiffuseScene}
              >
                Diffuse scene
              </button>
              <button
                className="anno-lab-button anno-lab-button--primary"
                type="button"
                onClick={handleContinueToReport}
                disabled={!canAdvanceToReport}
              >
                Continue to scene questions
              </button>
            </div>
            {interactionCapReached ? (
              <p className="salient-tbi-cap-note">
                Additional clicks are disabled for this task. Continue with the current choice or switch to diffuse
                scene.
              </p>
            ) : null}
          </PanelSection>
          <PanelSection title="Step B · Scene report" eyebrow="Questions">
            {step === 'report' ? (
              <>
                <p className="salient-tbi-panel-copy">
                  Keep the image in view while you answer these scene-level questions.
                </p>
                <div className="salient-tbi-question-block">
                  <strong>{overwhelmQuestion}</strong>
                  <div className="salient-tbi-pill-grid" role="group" aria-label={overwhelmQuestion}>
                    {OVERWHELM_OPTIONS.map((option) => (
                      <button
                        key={option}
                        className={`anno-lab-button anno-lab-button--ghost ${overwhelmRating === option ? 'is-active' : ''}`}
                        type="button"
                        onClick={() => setOverwhelmRating(option)}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
                {requiresSearchDifficulty ? (
                  <div className="salient-tbi-question-block">
                    <strong>{searchDifficultyQuestion}</strong>
                    <div className="salient-tbi-pill-grid" role="group" aria-label={searchDifficultyQuestion}>
                      {DIFFICULTY_OPTIONS.map((option) => (
                        <button
                          key={option}
                          className={`anno-lab-button anno-lab-button--ghost ${searchDifficulty === option ? 'is-active' : ''}`}
                          type="button"
                          onClick={() => setSearchDifficulty(option)}
                        >
                          {option[0].toUpperCase() + option.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="salient-tbi-callout">
                    <strong>Search difficulty skipped</strong>
                    <p>
                      Search difficulty is recorded as unavailable when the scene is marked as diffuse.
                    </p>
                  </div>
                )}
                <div className="salient-tbi-inline-actions">
                  <button
                    className="anno-lab-button anno-lab-button--ghost"
                    type="button"
                    onClick={handleBackToMark}
                  >
                    Edit selection
                  </button>
                  <button
                    className="anno-lab-button anno-lab-button--primary"
                    type="button"
                    onClick={() => void handleSubmit()}
                    disabled={!canSubmit}
                  >
                    {isSubmitting ? 'Submitting…' : 'Submit signal annotation'}
                  </button>
                </div>
              </>
            ) : (
              <EmptyState
                title="Scene questions unlock after the signal step"
                body="Choose a point, accept a suggested region, or mark the scene as diffuse before continuing."
              />
            )}
          </PanelSection>
        </>
      }
      footer={
        <StatusFooter
          feedback={activeFeedback}
          meta={[
            { label: 'Step', value: step === 'mark' ? 'Signal mark' : 'Scene report' },
            { label: 'Target', value: currentTarget?.kind ?? 'None' },
            { label: 'Clicks', value: String(promptCount) },
            { label: 'Proposal', value: proposalState },
            { label: 'View', value: 'Fit' },
            { label: 'Lens', value: formatMagnificationLabel(magnifierLevel) },
            { label: 'Schema', value: RESULT_SCHEMA_VERSION }
          ]}
          shortcuts={SHORTCUTS}
        />
      }
    >
      <div className={`salient-tbi-workspace ${step === 'report' ? 'is-report-step' : ''}`}>
        <div
          className={`anno-lab-stage salient-tbi-stage ${step === 'report' ? 'is-report-step' : ''}`}
          ref={stageRef}
          tabIndex={0}
          onMouseMove={magnifier.updateFromClientPoint}
          onMouseLeave={magnifier.clear}
        >
          {resolvedImageUrl ? (
            <img
              ref={imageRef}
              alt="Annotation target"
              className="anno-lab-stage__media"
              src={resolvedImageUrl}
              onLoad={refreshMetrics}
            />
          ) : null}
          <div
            className={`anno-lab-stage__overlay salient-tbi-overlay ${step !== 'mark' ? 'is-disabled' : ''}`}
            data-testid="salient-tbi-overlay"
            onMouseDown={handleOverlayMouseDown}
          >
            <svg aria-hidden="true" viewBox={`0 0 ${metrics?.renderedWidth ?? 1} ${metrics?.renderedHeight ?? 1}`}>
              {showSeedPolygon ? (
                <polygon
                  className={`salient-tbi-seed ${
                    proposalState === 'accepted' ? 'is-accepted' : 'is-preview'
                  }`}
                  points={seedPolygonPath}
                />
              ) : null}
              {displayPromptPoint ? (
                <g className="salient-tbi-point-marker" data-testid="signal-point-marker">
                  <circle className="salient-tbi-point-marker__pulse" cx={displayPromptPoint.x} cy={displayPromptPoint.y} r="16" />
                  <circle className="salient-tbi-point-marker__ring" cx={displayPromptPoint.x} cy={displayPromptPoint.y} r="9" />
                  <circle className="salient-tbi-point-marker__core" cx={displayPromptPoint.x} cy={displayPromptPoint.y} r="4.5" />
                </g>
              ) : null}
            </svg>
            <StageCrosshair crosshair={magnifier.crosshair} testIdPrefix="salient-tbi-crosshair" />
            <HoverMagnifier lens={magnifier.lens} testId="salient-tbi-magnifier" />
          </div>
          {workspaceMessage ? <div className="anno-lab-stage__hint">{workspaceMessage}</div> : null}
        </div>
        <div className="anno-lab-stage__caption">
          <div>
            <strong>{step === 'mark' ? 'Step A · Mark the signal' : 'Step B · Scene report'}</strong>
            <span>
              {step === 'mark'
                ? 'Use the image-only stage to identify the signal before any questionnaire appears.'
                : 'The image stays visible while you answer the scene-level questions.'}
            </span>
          </div>
          <div>
            <strong>{targetSummary}</strong>
            <span>
              {proposalState === 'accepted'
                ? 'Suggested region accepted.'
                : currentTarget?.kind === 'scene'
                  ? 'Diffuse scene recorded.'
                  : currentTarget?.kind === 'point'
                    ? `Prompt ${promptCount}/${MAX_SIGNAL_PROMPTS}`
                    : 'Awaiting selection'}
            </span>
          </div>
        </div>
      </div>
    </WorkspaceShell>
  );
};

export default App;
