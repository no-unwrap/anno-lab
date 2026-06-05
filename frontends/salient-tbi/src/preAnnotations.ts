import { readTaskPreAnnotations } from '@anno-lab/shared';
import type { TaskPreAnnotationPolygon } from '@anno-lab/shared';

export const loadSignalSeedPolygon = (
  payload: Record<string, unknown>
): TaskPreAnnotationPolygon | null => {
  const preAnnotations = readTaskPreAnnotations(payload);
  if (!preAnnotations) {
    return null;
  }

  const polygonPredictions = preAnnotations.predictions.filter(
    (prediction): prediction is TaskPreAnnotationPolygon => prediction.kind === 'polygon'
  );

  if (!polygonPredictions.length) {
    return null;
  }

  const [firstPrediction, ...remainingPredictions] = polygonPredictions;
  return remainingPredictions.reduce<TaskPreAnnotationPolygon>((best, candidate) => {
    const bestScore = typeof best.score === 'number' ? best.score : Number.NEGATIVE_INFINITY;
    const candidateScore =
      typeof candidate.score === 'number' ? candidate.score : Number.NEGATIVE_INFINITY;
    return candidateScore > bestScore ? candidate : best;
  }, firstPrediction);
};
