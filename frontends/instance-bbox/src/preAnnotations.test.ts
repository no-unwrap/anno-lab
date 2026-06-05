import { describe, expect, it } from 'vitest';

import { loadPreAnnotatedBoxes } from './preAnnotations';

describe('loadPreAnnotatedBoxes', () => {
  it('reads bbox predictions from Task.payload and ignores unsupported kinds', () => {
    const boxes = loadPreAnnotatedBoxes(
      {
        pre_annotations: {
          schema_version: '1.0.0',
          predictions: [
            {
              id: 'prediction-1',
              kind: 'bbox',
              label: 'person',
              bbox: { x: 24, y: 48, width: 160, height: 220 }
            },
            {
              id: 'prediction-2',
              kind: 'polygon',
              label: 'person',
              points: [
                { x: 0, y: 0 },
                { x: 40, y: 0 },
                { x: 40, y: 40 }
              ]
            }
          ]
        }
      },
      ['person', 'vehicle']
    );

    expect(boxes).toEqual([
      {
        id: 'prediction-1',
        label: 'person',
        rect: { x: 24, y: 48, width: 160, height: 220 }
      }
    ]);
  });

  it('fails closed on malformed pre-annotation payloads', () => {
    expect(
      loadPreAnnotatedBoxes(
        {
          pre_annotations: {
            schema_version: '2.0.0',
            predictions: [
              {
                kind: 'bbox',
                bbox: { x: 10, y: 10, width: 0, height: 10 }
              }
            ]
          }
        },
        ['person']
      )
    ).toEqual([]);
  });
});
