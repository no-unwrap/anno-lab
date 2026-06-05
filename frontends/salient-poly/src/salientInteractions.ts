import { clamp, displayPointToImage } from '@anno-lab/shared';
import type { DisplayPoint, ImageMetrics, ImagePoint } from '@anno-lab/shared';

import { DRAFT_CLOSE_RADIUS } from './constants';
import type { ClientPoint } from './types';

export interface ImageBounds {
  width: number;
  height: number;
}

interface StageRectLike {
  left: number;
  top: number;
}

export const getStageDisplayPoint = (
  clientPoint: ClientPoint,
  stageRect: StageRectLike
): DisplayPoint => ({
  x: clientPoint.clientX - stageRect.left,
  y: clientPoint.clientY - stageRect.top
});

export const getImagePointFromStageClient = (
  clientPoint: ClientPoint,
  stageRect: StageRectLike,
  metrics: ImageMetrics,
  options: { clampToImage?: boolean } = {}
): ImagePoint => {
  const imagePoint = displayPointToImage(
    getStageDisplayPoint(clientPoint, stageRect),
    metrics
  );
  if (!options.clampToImage) {
    return imagePoint;
  }

  return {
    x: clamp(imagePoint.x, 0, metrics.naturalWidth),
    y: clamp(imagePoint.y, 0, metrics.naturalHeight)
  };
};

export const clampImagePointToBounds = (
  point: ImagePoint,
  bounds: ImageBounds
): ImagePoint => ({
  x: clamp(point.x, 0, bounds.width),
  y: clamp(point.y, 0, bounds.height)
});

export const isNearDisplayPoint = (
  candidate: DisplayPoint,
  target: DisplayPoint,
  radius = DRAFT_CLOSE_RADIUS
): boolean => Math.hypot(candidate.x - target.x, candidate.y - target.y) <= radius;

export const isNearFirstDraftVertex = (
  candidate: DisplayPoint,
  draftDisplayPoints: DisplayPoint[],
  radius = DRAFT_CLOSE_RADIUS
): boolean =>
  Boolean(draftDisplayPoints[0]) &&
  isNearDisplayPoint(candidate, draftDisplayPoints[0], radius);
