import { useMemo } from 'react';
import type { MouseEvent as ReactMouseEvent, Ref } from 'react';

import {
  HoverMagnifier,
  imagePointToDisplay,
  StageCrosshair
} from '@anno-lab/shared';
import type {
  HoverCrosshairState,
  HoverMagnifierState,
  ImageMetrics
} from '@anno-lab/shared';

import { getStatusLabel } from '../poseState';
import type { Keypoint, SkeletonEdge, ToolMode } from '../types';

interface PoseCanvasProps {
  imageRef: Ref<HTMLImageElement>;
  keypoints: Keypoint[];
  magnifierCrosshair: HoverCrosshairState | null;
  magnifierLens: HoverMagnifierState | null;
  metrics: ImageMetrics | null;
  mode: ToolMode;
  onKeypointMouseDown: (
    event: ReactMouseEvent<SVGCircleElement>,
    keypoint: Keypoint
  ) => void;
  onOverlayMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onStageMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onStageMouseLeave: () => void;
  onStageMouseMove: (event: { clientX: number; clientY: number }) => void;
  refreshMetrics: () => void;
  resolvedImageUrl?: string;
  selectedKeypoint: Keypoint | null;
  selectedLandmarkId: string | null;
  skeleton: SkeletonEdge[];
  stageRef: Ref<HTMLDivElement>;
  workspaceMessage: string;
}

export const PoseCanvas = ({
  imageRef,
  keypoints,
  magnifierCrosshair,
  magnifierLens,
  metrics,
  mode,
  onKeypointMouseDown,
  onOverlayMouseDown,
  onStageMouseDown,
  onStageMouseLeave,
  onStageMouseMove,
  refreshMetrics,
  resolvedImageUrl,
  selectedKeypoint,
  selectedLandmarkId,
  skeleton,
  stageRef,
  workspaceMessage
}: PoseCanvasProps) => {
  const displayedKeypoints = useMemo(
    () =>
      metrics
        ? keypoints.map((keypoint) => ({
            ...keypoint,
            displayPoint: keypoint.point ? imagePointToDisplay(keypoint.point, metrics) : null
          }))
        : [],
    [keypoints, metrics]
  );
  const displayKeypointById = useMemo(
    () =>
      new Map(
        displayedKeypoints.map((keypoint) => [keypoint.landmarkId, keypoint] as const)
      ),
    [displayedKeypoints]
  );
  const displaySkeleton = useMemo(
    () =>
      skeleton.flatMap((edge, index) => {
        const from = displayKeypointById.get(edge.from);
        const to = displayKeypointById.get(edge.to);
        if (!from?.displayPoint || !to?.displayPoint) {
          return [];
        }

        if (from.state === 'pending' || to.state === 'pending') {
          return [];
        }

        if (from.state === 'not_in_frame' || to.state === 'not_in_frame') {
          return [];
        }

        return [
          {
            id: `${edge.from}-${edge.to}-${index}`,
            from: from.displayPoint,
            to: to.displayPoint,
            isOccluded: from.state === 'occluded' || to.state === 'occluded'
          }
        ];
      }),
    [displayKeypointById, skeleton]
  );

  return (
    <div className="anno-lab-canvas-region">
      <div
        className="anno-lab-stage"
        ref={stageRef}
        tabIndex={0}
        onMouseDown={onStageMouseDown}
        onMouseLeave={onStageMouseLeave}
        onMouseMove={(event) => onStageMouseMove(event)}
      >
        {resolvedImageUrl ? (
          <>
            <img
              alt="Annotation target"
              className="anno-lab-stage__media"
              ref={imageRef}
              src={resolvedImageUrl}
              onLoad={refreshMetrics}
            />
            <div
              className={`anno-lab-stage__overlay pose-overlay ${mode === 'select' ? 'pose-overlay--select' : ''}`.trim()}
              onMouseDown={onOverlayMouseDown}
              role="presentation"
            >
              <svg width="100%" height="100%">
                {displaySkeleton.map((edge) => (
                  <line
                    key={edge.id}
                    className={`pose-skeleton-line ${edge.isOccluded ? 'is-occluded' : ''}`}
                    x1={edge.from.x}
                    y1={edge.from.y}
                    x2={edge.to.x}
                    y2={edge.to.y}
                  />
                ))}
                {displayedKeypoints.map((keypoint) => {
                  if (!keypoint.displayPoint) {
                    return null;
                  }

                  const radius = selectedLandmarkId === keypoint.landmarkId ? 10 : 8;
                  return (
                    <g key={keypoint.landmarkId}>
                      <circle
                        className={`pose-keypoint ${selectedLandmarkId === keypoint.landmarkId ? 'is-selected' : ''} ${keypoint.state === 'occluded' ? 'is-occluded' : ''}`.trim()}
                        data-landmark-id={keypoint.landmarkId}
                        cx={keypoint.displayPoint.x}
                        cy={keypoint.displayPoint.y}
                        r={radius}
                        onMouseDown={(event) => onKeypointMouseDown(event, keypoint)}
                      />
                      <text
                        className="pose-keypoint__label"
                        x={keypoint.displayPoint.x + 12}
                        y={keypoint.displayPoint.y - 12}
                      >
                        {keypoint.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
            <StageCrosshair crosshair={magnifierCrosshair} testIdPrefix="pose-crosshair" />
            <HoverMagnifier lens={magnifierLens} testId="pose-magnifier" />
            {workspaceMessage ? (
              <div className="anno-lab-stage__hint">
                <p>{workspaceMessage}</p>
              </div>
            ) : null}
          </>
        ) : (
          <div className="anno-lab-stage__hint">
            <p>{workspaceMessage || 'Provide an asset URL to begin annotating.'}</p>
          </div>
        )}
      </div>
      <div className="anno-lab-stage__caption">
        <div>
          <strong>{selectedKeypoint ? selectedKeypoint.label : 'No landmark selected'}</strong>
          <span>
            {selectedKeypoint
              ? `${getStatusLabel(selectedKeypoint.state)} · ${selectedKeypoint.point ? 'Placed in natural image pixels' : 'Awaiting placement'}`
              : 'Select a landmark from the rail to continue.'}
          </span>
        </div>
        <div>
          <strong>Fit-to-workspace view</strong>
          <span>
            {mode === 'place'
              ? 'Click anywhere on the image to place the selected landmark.'
              : 'Drag visible points to refine their coordinates.'}
          </span>
        </div>
      </div>
    </div>
  );
};
