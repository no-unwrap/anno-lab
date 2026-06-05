import { clamp, displayPointToImage } from './geometry';
import type { DisplayPoint, ImageMetrics, ImagePoint } from './types';

interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
}

export const DEFAULT_VIEWPORT: ViewportState = {
  zoom: 1,
  panX: 0,
  panY: 0
};

const roundViewportValue = (value: number, digits = 2): number =>
  Number(value.toFixed(digits));

export const stagePointToViewportDisplayPoint = (
  stagePoint: DisplayPoint,
  viewport: ViewportState
): DisplayPoint => ({
  x: roundViewportValue((stagePoint.x - viewport.panX) / viewport.zoom),
  y: roundViewportValue((stagePoint.y - viewport.panY) / viewport.zoom)
});

export const isViewportDisplayPointInsideImage = (
  displayPoint: DisplayPoint,
  metrics: ImageMetrics
): boolean =>
  displayPoint.x >= 0 &&
  displayPoint.y >= 0 &&
  displayPoint.x <= metrics.renderedWidth &&
  displayPoint.y <= metrics.renderedHeight;

export const clampViewportDisplayPointToImage = (
  displayPoint: DisplayPoint,
  metrics: ImageMetrics
): DisplayPoint => ({
  x: roundViewportValue(clamp(displayPoint.x, 0, metrics.renderedWidth)),
  y: roundViewportValue(clamp(displayPoint.y, 0, metrics.renderedHeight))
});

export const stagePointToImagePoint = (
  stagePoint: DisplayPoint,
  metrics: ImageMetrics,
  viewport: ViewportState,
  options: { clampToImage?: boolean } = {}
): ImagePoint => {
  const displayPoint = stagePointToViewportDisplayPoint(stagePoint, viewport);
  const nextDisplayPoint = options.clampToImage
    ? clampViewportDisplayPointToImage(displayPoint, metrics)
    : displayPoint;
  return displayPointToImage(nextDisplayPoint, metrics);
};
