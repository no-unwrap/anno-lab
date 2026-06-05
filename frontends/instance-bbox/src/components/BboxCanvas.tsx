import type { MouseEvent as ReactMouseEvent, Ref } from 'react';

import {
  HoverMagnifier,
  imageRectToDisplay,
  StageCrosshair
} from '@anno-lab/shared';
import type {
  HoverCrosshairState,
  HoverMagnifierState,
  ImageMetrics,
  ImageRect
} from '@anno-lab/shared';

import type { Box, ResizeHandle, ToolMode } from '../types';

const RESIZE_HANDLES = ['nw', 'ne', 'sw', 'se'] as const satisfies readonly ResizeHandle[];

interface BboxCanvasProps {
  boxes: Box[];
  draftRect: ImageRect | null;
  imageRef: Ref<HTMLImageElement>;
  isSelected: (boxId: string) => boolean;
  magnifierCrosshair: HoverCrosshairState | null;
  magnifierLens: HoverMagnifierState | null;
  metrics: ImageMetrics | null;
  mode: ToolMode;
  onBoxMouseDown: (event: ReactMouseEvent<SVGRectElement>, box: Box, index: number) => void;
  onCanvasMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onHandleMouseDown: (
    event: ReactMouseEvent<SVGCircleElement>,
    box: Box,
    handle: ResizeHandle
  ) => void;
  onStageMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onStageMouseLeave: () => void;
  onStageMouseMove: (event: { clientX: number; clientY: number }) => void;
  refreshMetrics: () => void;
  resolvedImageUrl?: string;
  stageRef: Ref<HTMLDivElement>;
  workspaceMessage: string;
}

export const BboxCanvas = ({
  boxes,
  draftRect,
  imageRef,
  isSelected,
  magnifierCrosshair,
  magnifierLens,
  metrics,
  mode,
  onBoxMouseDown,
  onCanvasMouseDown,
  onHandleMouseDown,
  onStageMouseDown,
  onStageMouseLeave,
  onStageMouseMove,
  refreshMetrics,
  resolvedImageUrl,
  stageRef,
  workspaceMessage
}: BboxCanvasProps) => (
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
            className={`anno-lab-stage__overlay bbox-overlay ${mode === 'select' ? 'bbox-overlay--select' : ''}`.trim()}
            onMouseDown={onCanvasMouseDown}
            role="presentation"
          >
            <svg width="100%" height="100%">
              {boxes.map((box, index) => {
                if (!metrics) {
                  return null;
                }

                const displayRect = imageRectToDisplay(box.rect, metrics);
                const selected = isSelected(box.id);

                return (
                  <g key={box.id}>
                    <rect
                      className={`bbox-box ${selected ? 'is-selected' : ''}`}
                      data-box-id={box.id}
                      x={displayRect.x}
                      y={displayRect.y}
                      width={displayRect.width}
                      height={displayRect.height}
                      onMouseDown={(event) => onBoxMouseDown(event, box, index)}
                    />
                    <text className="bbox-box__label" x={displayRect.x + 8} y={displayRect.y + 20}>
                      {box.label}
                    </text>
                    {selected && mode === 'select'
                      ? RESIZE_HANDLES.map((handle) => {
                          const x =
                            handle.includes('w')
                              ? displayRect.x
                              : displayRect.x + displayRect.width;
                          const y =
                            handle.includes('n')
                              ? displayRect.y
                              : displayRect.y + displayRect.height;

                          return (
                            <circle
                              key={`${box.id}-${handle}`}
                              className="bbox-handle"
                              cx={x}
                              cy={y}
                              r={6}
                              onMouseDown={(event) => onHandleMouseDown(event, box, handle)}
                            />
                          );
                        })
                      : null}
                  </g>
                );
              })}
              {draftRect && metrics ? (
                (() => {
                  const displayRect = imageRectToDisplay(draftRect, metrics);
                  return (
                    <rect
                      className="bbox-box bbox-box--draft"
                      x={displayRect.x}
                      y={displayRect.y}
                      width={displayRect.width}
                      height={displayRect.height}
                    />
                  );
                })()
              ) : null}
            </svg>
          </div>
          <StageCrosshair crosshair={magnifierCrosshair} testIdPrefix="bbox-crosshair" />
          <HoverMagnifier lens={magnifierLens} testId="bbox-magnifier" />
          {workspaceMessage ? <div className="anno-lab-stage__hint">{workspaceMessage}</div> : null}
        </>
      ) : (
        <div className="anno-lab-stage__hint">{workspaceMessage}</div>
      )}
    </div>
    <div className="anno-lab-stage__caption">
      <div>
        <span className="anno-lab-muted-label">Interaction model</span>
        <strong>Draw and refine boxes while the image stays fitted to the workspace</strong>
      </div>
      <div>
        <span className="anno-lab-muted-label">Coordinate system</span>
        <strong>Natural image pixels with magnifier-assisted precision</strong>
      </div>
    </div>
  </div>
);
