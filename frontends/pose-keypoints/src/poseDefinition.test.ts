import { describe, expect, it } from 'vitest';

import { normalizeLandmarks, normalizeSkeleton } from './poseDefinition';

describe('poseDefinition', () => {
  it('normalizes mixed landmark definitions, deduplicates ids, and falls back on color defaults', () => {
    expect(
      normalizeLandmarks([
        'Nose',
        { id: 'left_shoulder', label: 'Left shoulder', color: '#123456' },
        { id: 'left shoulder', label: 'Duplicate shoulder' },
        { label: 'Right hip' },
        null
      ])
    ).toEqual([
      { id: 'nose', label: 'Nose', color: '#f28f16' },
      { id: 'left_shoulder', label: 'Left shoulder', color: '#123456' },
      { id: 'right_hip', label: 'Right hip', color: '#b56576' }
    ]);
  });

  it('falls back to the default skeleton when configured edges do not match known landmarks', () => {
    const landmarks = normalizeLandmarks([
      'Nose',
      'Left shoulder',
      'Right shoulder',
      'Left hip'
    ]);

    expect(
      normalizeSkeleton(
        [
          ['nose', 'pelvis'],
          ['nose', 'nose'],
          { from: 'left_shoulder', to: 'right_shoulder' }
        ],
        landmarks
      )
    ).toEqual([
      { from: 'left_shoulder', to: 'right_shoulder' }
    ]);

    expect(normalizeSkeleton([{ from: 'nose', to: 'pelvis' }], landmarks)).toEqual([
      { from: 'nose', to: 'left_shoulder' },
      { from: 'nose', to: 'right_shoulder' },
      { from: 'left_shoulder', to: 'left_hip' },
      { from: 'left_shoulder', to: 'right_shoulder' }
    ]);
  });
});
