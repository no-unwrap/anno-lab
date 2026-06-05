import { useMemo } from 'react';
import type { MouseEvent as ReactMouseEvent, Ref } from 'react';

import {
  HoverMagnifier,
  StageCrosshair
} from '@anno-lab/shared';
import type {
  DisplayPoint,
  HoverCrosshairState,
  HoverMagnifierState
} from '@anno-lab/shared';

import {
  buildPolygonInsertHandles,
  formatPointPath,
  formatPolygonName
} from '../salientGeometry';
import type { DisplayPolygon, VertexDragState } from '../types';

interface SalientCanvasProps {
  canCloseDraft: boolean;
  draftClosePreviewActive: boolean;
  draftDisplayPoints: DisplayPoint[];
  displayPolygons: DisplayPolygon[];
  imageRef: Ref<HTMLImageElement>;
  interaction: VertexDragState | null;
  magnifierCrosshair: HoverCrosshairState | null;
  magnifierLens: HoverMagnifierState | null;
  onClosedVertexMouseDown: (
    event: ReactMouseEvent<SVGCircleElement>,
    polygon: DisplayPolygon,
    vertexIndex: number
  ) => void;
  onInsertVertex: (polygon: DisplayPolygon, afterVertexIndex: number) => void;
  onOverlayClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onOverlayMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onPolygonSelect: (polygon: DisplayPolygon) => void;
  onStageMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onStageMouseLeave: () => void;
  onStageMouseMove: (event: ReactMouseEvent<HTMLDivElement>) => void;
  pointRemovalModeActive: boolean;
  refreshMetrics: () => void;
  resolvedImageUrl?: string;
  selectedPolygonId: string | null;
  stageRef: Ref<HTMLDivElement>;
  workspaceMessage: string;
}

export const SalientCanvas = ({
  canCloseDraft,
  draftClosePreviewActive,
  draftDisplayPoints,
  displayPolygons,
  imageRef,
  interaction,
  magnifierCrosshair,
  magnifierLens,
  onClosedVertexMouseDown,
  onInsertVertex,
  onOverlayClick,
  onOverlayMouseDown,
  onPolygonSelect,
  onStageMouseDown,
  onStageMouseLeave,
  onStageMouseMove,
  pointRemovalModeActive,
  refreshMetrics,
  resolvedImageUrl,
  selectedPolygonId,
  stageRef,
  workspaceMessage
}: SalientCanvasProps) => {
  const draftPath = useMemo(
    () => formatPointPath(draftDisplayPoints),
    [draftDisplayPoints]
  );
  const selectedPolygon = useMemo(
    () =>
      displayPolygons.find((polygon) => polygon.id === selectedPolygonId) ?? null,
    [displayPolygons, selectedPolygonId]
  );
  const insertHandles = useMemo(
    () =>
      selectedPolygon &&
      !interaction &&
      !pointRemovalModeActive
        ? buildPolygonInsertHandles(selectedPolygon)
        : [],
    [interaction, pointRemovalModeActive, selectedPolygon]
  );

  return (
    <div className="anno-lab-canvas-region">
      <div
        className="anno-lab-stage"
        ref={stageRef}
        tabIndex={0}
        onMouseDown={onStageMouseDown}
        onMouseLeave={onStageMouseLeave}
        onMouseMove={onStageMouseMove}
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
              className="anno-lab-stage__overlay salient-overlay"
              onClick={onOverlayClick}
              onMouseDown={onOverlayMouseDown}
              role="presentation"
            >
              <svg width="100%" height="100%">
                {displayPolygons.map((polygon) => (
                  <g key={polygon.id}>
                    <polygon
                      className={`salient-polygon-fill ${selectedPolygonId === polygon.id ? 'is-selected' : ''}`}
                      points={polygon.path}
                      onClick={(event) => {
                        event.stopPropagation();
                        onPolygonSelect(polygon);
                      }}
                    />
                    <polygon
                      className={`salient-polygon-line ${selectedPolygonId === polygon.id ? 'is-selected' : ''}`}
                      points={polygon.path}
                      onClick={(event) => {
                        event.stopPropagation();
                        onPolygonSelect(polygon);
                      }}
                    />
                    {polygon.displayPoints[0] ? (
                      <text
                        className="salient-polygon-label"
                        x={polygon.displayPoints[0].x + 10}
                        y={polygon.displayPoints[0].y - 10}
                      >
                        {formatPolygonName(polygon.index)}
                      </text>
                    ) : null}
                    {polygon.displayPoints.map((point, vertexIndex) => {
                      const isDraggingCurrentVertex =
                        interaction?.polygonId === polygon.id &&
                        interaction.vertexIndex === vertexIndex;
                      return (
                        <circle
                          key={`${polygon.id}-${vertexIndex}`}
                          className={`salient-vertex-handle ${selectedPolygonId === polygon.id ? 'is-selected' : ''} ${isDraggingCurrentVertex ? 'is-dragging' : ''}`.trim()}
                          cx={point.x}
                          cy={point.y}
                          r={selectedPolygonId === polygon.id ? 5.4 : 4.4}
                          data-polygon-id={polygon.id}
                          data-vertex-index={String(vertexIndex)}
                          onMouseDown={(event) =>
                            onClosedVertexMouseDown(event, polygon, vertexIndex)
                          }
                        />
                      );
                    })}
                    {selectedPolygonId === polygon.id
                      ? insertHandles.map((handle) => (
                          <g
                            key={`${handle.polygonId}-${handle.afterVertexIndex}`}
                            className="salient-insert-handle"
                            data-insert-after-index={String(handle.afterVertexIndex)}
                            onClick={(event) => {
                              event.stopPropagation();
                              onInsertVertex(polygon, handle.afterVertexIndex);
                            }}
                          >
                            <circle cx={handle.x} cy={handle.y} r={6.2} />
                            <path
                              className="salient-insert-handle__mark"
                              d={`M ${handle.x - 3} ${handle.y} H ${handle.x + 3} M ${handle.x} ${handle.y - 3} V ${handle.y + 3}`}
                            />
                          </g>
                        ))
                      : null}
                  </g>
                ))}
                {draftClosePreviewActive && canCloseDraft ? (
                  <>
                    <polygon
                      className="salient-polygon-fill salient-polygon-fill--ready"
                      points={draftPath}
                    />
                    <polygon
                      className="salient-polygon-line salient-polygon-line--ready"
                      points={draftPath}
                    />
                  </>
                ) : draftDisplayPoints.length >= 2 ? (
                  <polyline
                    className="salient-polygon-line salient-polygon-line--draft"
                    points={draftPath}
                  />
                ) : null}
                {draftDisplayPoints.map((point, index) => (
                  <circle
                    key={`${point.x}-${point.y}-${index}`}
                    className={`salient-vertex ${index === 0 ? 'salient-vertex--first' : ''} ${index === 0 && draftClosePreviewActive ? 'salient-vertex--ready-close' : ''}`.trim()}
                    cx={point.x}
                    cy={point.y}
                    r={index === 0 ? 6 : 4.2}
                    data-draft-vertex-index={String(index)}
                    data-close-ready={
                      index === 0 && draftClosePreviewActive ? 'true' : 'false'
                    }
                  />
                ))}
              </svg>
            </div>
            <StageCrosshair
              crosshair={magnifierCrosshair}
              testIdPrefix="salient-crosshair"
            />
            <HoverMagnifier lens={magnifierLens} testId="salient-magnifier" />
            {workspaceMessage ? (
              <div className="anno-lab-stage__hint">{workspaceMessage}</div>
            ) : null}
          </>
        ) : (
          <div className="anno-lab-stage__hint">{workspaceMessage}</div>
        )}
      </div>
      <div className="anno-lab-stage__caption">
        <div>
          <span className="anno-lab-muted-label">Coordinate system</span>
          <strong>Natural image pixels</strong>
        </div>
      <div>
        <span className="anno-lab-muted-label">Interaction model</span>
        <strong>
          Click to add vertices, hover the first point to arm close, then drag closed vertices to refine each object while the image stays fitted to the workspace.
        </strong>
      </div>
      </div>
    </div>
  );
};
