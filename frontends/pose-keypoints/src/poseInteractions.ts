import { clamp } from '@anno-lab/shared';
import type { ImagePoint } from '@anno-lab/shared';

import type { DragKeypointState, InteractionState } from './types';

export interface ImageBounds {
  width: number;
  height: number;
}

export const clampKeypointPoint = (
  point: ImagePoint,
  bounds: ImageBounds
): ImagePoint => ({
  x: clamp(point.x, 0, bounds.width),
  y: clamp(point.y, 0, bounds.height)
});

export const createDraggingInteraction = (
  landmarkId: string,
  state: DragKeypointState
): NonNullable<InteractionState> => ({
  type: 'dragging',
  landmarkId,
  state
});
