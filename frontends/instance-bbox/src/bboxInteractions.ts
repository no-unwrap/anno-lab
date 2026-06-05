import type { ImagePoint, ImageRect } from '@anno-lab/shared';

import { moveBoxRect, resizeBoxRect, type ImageBounds } from './bboxGeometry';
import type { InteractionState, ResizeHandle } from './types';

export type InteractionMoveResult =
  | { kind: 'interaction'; interaction: InteractionState }
  | { kind: 'box'; boxId: string; rect: ImageRect }
  | null;

export interface ResolveInteractionMoveOptions {
  imagePoint: ImagePoint | null;
  assetBounds: ImageBounds;
  minBoxSize: number;
}

export const createDrawingInteraction = (start: ImagePoint): InteractionState => ({
  type: 'drawing',
  start,
  current: start
});

export const createMoveInteraction = (
  boxId: string,
  start: ImagePoint,
  initialRect: ImageRect
): InteractionState => ({
  type: 'moving',
  boxId,
  start,
  initialRect
});

export const createResizeInteraction = (
  boxId: string,
  handle: ResizeHandle,
  initialRect: ImageRect
): InteractionState => ({
  type: 'resizing',
  boxId,
  handle,
  initialRect
});

export const updateDrawingInteraction = (
  interaction: InteractionState,
  current: ImagePoint
): InteractionState =>
  interaction && interaction.type === 'drawing' ? { ...interaction, current } : interaction;

export const resolveInteractionMove = (
  interaction: InteractionState,
  options: ResolveInteractionMoveOptions
): InteractionMoveResult => {
  if (!interaction) {
    return null;
  }

  if (!options.imagePoint) {
    return null;
  }

  if (interaction.type === 'drawing') {
    return {
      kind: 'interaction',
      interaction: updateDrawingInteraction(interaction, options.imagePoint)
    };
  }

  if (interaction.type === 'moving') {
    return {
      kind: 'box',
      boxId: interaction.boxId,
      rect: moveBoxRect(
        interaction.initialRect,
        interaction.start,
        options.imagePoint,
        options.assetBounds
      )
    };
  }

  return {
    kind: 'box',
    boxId: interaction.boxId,
    rect: resizeBoxRect(
      interaction.initialRect,
      interaction.handle,
      options.imagePoint,
      options.minBoxSize,
      options.assetBounds
    )
  };
};
