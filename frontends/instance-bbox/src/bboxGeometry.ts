import { clamp, rectFromPoints } from '@anno-lab/shared';
import type { ImagePoint, ImageRect } from '@anno-lab/shared';

import type { ResizeHandle } from './types';

export interface ImageBounds {
  width: number;
  height: number;
}

export const formatPixels = (value: number): string => `${Math.round(value)} px`;

export const normalizeBoxRect = (
  start: ImagePoint,
  end: ImagePoint,
  bounds: ImageBounds
): ImageRect => {
  const rect = rectFromPoints(start, end);
  return {
    x: clamp(rect.x, 0, Math.max(0, bounds.width - rect.width)),
    y: clamp(rect.y, 0, Math.max(0, bounds.height - rect.height)),
    width: rect.width,
    height: rect.height
  };
};

export const isRectAtLeastSize = (rect: ImageRect, minBoxSize: number): boolean =>
  rect.width >= minBoxSize && rect.height >= minBoxSize;

export const moveBoxRect = (
  initialRect: ImageRect,
  start: ImagePoint,
  current: ImagePoint,
  bounds: ImageBounds
): ImageRect => {
  const deltaX = current.x - start.x;
  const deltaY = current.y - start.y;

  return {
    ...initialRect,
    x: clamp(initialRect.x + deltaX, 0, Math.max(0, bounds.width - initialRect.width)),
    y: clamp(initialRect.y + deltaY, 0, Math.max(0, bounds.height - initialRect.height))
  };
};

export const resizeBoxRect = (
  initialRect: ImageRect,
  handle: ResizeHandle,
  imagePoint: ImagePoint,
  minBoxSize: number,
  bounds: ImageBounds
): ImageRect => {
  let left = initialRect.x;
  let top = initialRect.y;
  let right = initialRect.x + initialRect.width;
  let bottom = initialRect.y + initialRect.height;

  if (handle.includes('n')) {
    top = clamp(imagePoint.y, 0, bottom - minBoxSize);
  }
  if (handle.includes('s')) {
    bottom = clamp(imagePoint.y, top + minBoxSize, bounds.height);
  }
  if (handle.includes('w')) {
    left = clamp(imagePoint.x, 0, right - minBoxSize);
  }
  if (handle.includes('e')) {
    right = clamp(imagePoint.x, left + minBoxSize, bounds.width);
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
};
