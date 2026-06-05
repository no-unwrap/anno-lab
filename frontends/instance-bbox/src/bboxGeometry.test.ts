import { describe, expect, it } from 'vitest';

import { createDrawingInteraction, resolveInteractionMove } from './bboxInteractions';
import { moveBoxRect, normalizeBoxRect, resizeBoxRect } from './bboxGeometry';

describe('bboxGeometry', () => {
  it('normalizes a drag rect and clamps it to the image bounds', () => {
    expect(
      normalizeBoxRect(
        { x: 350, y: 260 },
        { x: 510, y: 380 },
        { width: 400, height: 300 }
      )
    ).toEqual({
      x: 240,
      y: 180,
      width: 160,
      height: 120
    });
  });

  it('keeps moved boxes inside the image bounds', () => {
    expect(
      moveBoxRect(
        { x: 320, y: 250, width: 80, height: 50 },
        { x: 350, y: 270 },
        { x: 390, y: 310 },
        { width: 400, height: 300 }
      )
    ).toEqual({
      x: 320,
      y: 250,
      width: 80,
      height: 50
    });
  });

  it('enforces minimum size when resizing from a corner handle', () => {
    expect(
      resizeBoxRect(
        { x: 100, y: 120, width: 80, height: 70 },
        'nw',
        { x: 170, y: 180 },
        24,
        { width: 400, height: 300 }
      )
    ).toEqual({
      x: 156,
      y: 166,
      width: 24,
      height: 24
    });
  });
});

describe('bboxInteractions', () => {
  it('updates the current point for drawing interactions', () => {
    expect(
      resolveInteractionMove(createDrawingInteraction({ x: 40, y: 60 }), {
        imagePoint: { x: 120, y: 160 },
        assetBounds: { width: 400, height: 300 },
        minBoxSize: 12
      })
    ).toEqual({
      kind: 'interaction',
      interaction: {
        type: 'drawing',
        start: { x: 40, y: 60 },
        current: { x: 120, y: 160 }
      }
    });
  });
});
