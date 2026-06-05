import {
  DEFAULT_INSTRUCTION_TEXT,
  DEFAULT_SUBJECT_LABEL,
  FALLBACK_LANDMARKS,
  FALLBACK_SKELETON
} from './constants';
import type { LandmarkDefinition, PoseDefinition, SkeletonEdge } from './types';

export const slugifyLandmarkId = (value: string): string => {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return normalized.replace(/^_+|_+$/g, '') || 'landmark';
};

export const normalizeLandmarks = (rawLandmarks: unknown): LandmarkDefinition[] => {
  if (!Array.isArray(rawLandmarks)) {
    return FALLBACK_LANDMARKS;
  }

  const seenIds = new Set<string>();
  const normalized: LandmarkDefinition[] = [];

  rawLandmarks.forEach((entry, index) => {
    if (typeof entry === 'string') {
      const id = slugifyLandmarkId(entry);
      if (seenIds.has(id)) {
        return;
      }

      seenIds.add(id);
      normalized.push({
        id,
        label: entry,
        color: FALLBACK_LANDMARKS[index % FALLBACK_LANDMARKS.length].color
      });
      return;
    }

    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return;
    }

    const labelCandidate =
      typeof entry.label === 'string' && entry.label.trim()
        ? entry.label.trim()
        : typeof entry.id === 'string' && entry.id.trim()
          ? entry.id.trim().replace(/_/g, ' ')
          : '';
    if (!labelCandidate) {
      return;
    }

    const idCandidate =
      typeof entry.id === 'string' && entry.id.trim()
        ? slugifyLandmarkId(entry.id)
        : slugifyLandmarkId(labelCandidate);
    if (seenIds.has(idCandidate)) {
      return;
    }

    seenIds.add(idCandidate);
    normalized.push({
      id: idCandidate,
      label: labelCandidate,
      color:
        typeof entry.color === 'string' && entry.color.trim()
          ? entry.color.trim()
          : FALLBACK_LANDMARKS[index % FALLBACK_LANDMARKS.length].color
    });
  });

  return normalized.length ? normalized : FALLBACK_LANDMARKS;
};

export const normalizeSkeleton = (
  rawSkeleton: unknown,
  landmarks: LandmarkDefinition[]
): SkeletonEdge[] => {
  const landmarkIds = new Set(landmarks.map((landmark) => landmark.id));
  const parseEdge = (entry: unknown): SkeletonEdge | null => {
    if (Array.isArray(entry) && entry.length === 2) {
      const [from, to] = entry;
      if (typeof from === 'string' && typeof to === 'string') {
        return { from, to };
      }
      return null;
    }

    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return null;
    }

    const candidate = entry as { from?: unknown; to?: unknown };
    if (typeof candidate.from === 'string' && typeof candidate.to === 'string') {
      return { from: candidate.from, to: candidate.to };
    }

    return null;
  };

  const normalized = Array.isArray(rawSkeleton)
    ? rawSkeleton
        .map(parseEdge)
        .filter((edge): edge is SkeletonEdge => Boolean(edge))
        .filter(
          (edge) =>
            edge.from !== edge.to &&
            landmarkIds.has(edge.from) &&
            landmarkIds.has(edge.to)
        )
    : [];

  if (normalized.length) {
    return normalized;
  }

  return FALLBACK_SKELETON.filter(
    (edge) => landmarkIds.has(edge.from) && landmarkIds.has(edge.to)
  );
};

export const resolveSubjectLabel = (definition: PoseDefinition): string =>
  typeof definition.subject_label === 'string' && definition.subject_label.trim()
    ? definition.subject_label.trim()
    : DEFAULT_SUBJECT_LABEL;

export const resolveInstructionText = (definition: PoseDefinition): string =>
  typeof definition.instructions === 'string' && definition.instructions.trim()
    ? definition.instructions.trim()
    : DEFAULT_INSTRUCTION_TEXT;
