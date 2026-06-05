import { DisplayPoint, DisplayRect, ImageMetrics, ImagePoint, ImageRect } from './types';

const roundToImage = (value: number): number => Number(value.toFixed(2));

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

export const displayPointToImage = (
  displayPoint: DisplayPoint,
  metrics: ImageMetrics
): ImagePoint => {
  const scaleX = metrics.naturalWidth / metrics.renderedWidth;
  const scaleY = metrics.naturalHeight / metrics.renderedHeight;

  return {
    x: roundToImage(displayPoint.x * scaleX),
    y: roundToImage(displayPoint.y * scaleY)
  };
};

export const imagePointToDisplay = (
  imagePoint: ImagePoint,
  metrics: ImageMetrics
): DisplayPoint => ({
  x: (imagePoint.x / metrics.naturalWidth) * metrics.renderedWidth,
  y: (imagePoint.y / metrics.naturalHeight) * metrics.renderedHeight
});

export const imageRectToDisplay = (imageRect: ImageRect, metrics: ImageMetrics): DisplayRect => {
  const origin = imagePointToDisplay({ x: imageRect.x, y: imageRect.y }, metrics);
  const corner = imagePointToDisplay(
    {
      x: imageRect.x + imageRect.width,
      y: imageRect.y + imageRect.height
    },
    metrics
  );

  return {
    x: origin.x,
    y: origin.y,
    width: corner.x - origin.x,
    height: corner.y - origin.y
  };
};

export const rectFromPoints = (start: ImagePoint, end: ImagePoint): ImageRect => ({
  x: Math.min(start.x, end.x),
  y: Math.min(start.y, end.y),
  width: roundToImage(Math.abs(end.x - start.x)),
  height: roundToImage(Math.abs(end.y - start.y))
});
