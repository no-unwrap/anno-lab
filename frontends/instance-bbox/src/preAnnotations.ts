import { readTaskPreAnnotations } from '@anno-lab/shared';

import { createBoxId } from './bboxState';
import type { Box } from './types';

const resolveBoxId = (candidateId: string | undefined, usedIds: Set<string>): string => {
  if (candidateId && !usedIds.has(candidateId)) {
    return candidateId;
  }

  const generatedId = createBoxId();
  if (!usedIds.has(generatedId)) {
    return generatedId;
  }

  let suffix = 1;
  let dedupedId = `${generatedId}-${suffix}`;
  while (usedIds.has(dedupedId)) {
    suffix += 1;
    dedupedId = `${generatedId}-${suffix}`;
  }

  return dedupedId;
};

const resolveBoxLabel = (
  candidateLabel: string | undefined,
  labels: readonly string[]
): string => {
  const trimmedLabel = candidateLabel?.trim();
  return trimmedLabel || labels[0] || 'object';
};

export const loadPreAnnotatedBoxes = (
  payload: Record<string, unknown>,
  labels: readonly string[]
): Box[] => {
  const preAnnotations = readTaskPreAnnotations(payload);
  if (!preAnnotations) {
    return [];
  }

  const usedIds = new Set<string>();

  return preAnnotations.predictions.flatMap((prediction) => {
    if (prediction.kind !== 'bbox') {
      return [];
    }

    const boxId = resolveBoxId(prediction.id, usedIds);
    usedIds.add(boxId);

    return [
      {
        id: boxId,
        label: resolveBoxLabel(prediction.label, labels),
        rect: prediction.bbox
      }
    ];
  });
};
