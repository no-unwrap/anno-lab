import type {
  ImagePoint,
  ImageRect,
  TaskPreAnnotation,
  TaskPreAnnotationBase,
  TaskPreAnnotationBbox,
  TaskPreAnnotationKeypoint,
  TaskPreAnnotationKeypointState,
  TaskPreAnnotationKeypoints,
  TaskPreAnnotationPolygon,
  TaskPreAnnotations
} from './types';

export const PRE_ANNOTATIONS_SCHEMA_VERSION = '1.0.0';

const PRE_ANNOTATION_KEYPOINT_STATES = new Set<TaskPreAnnotationKeypointState>([
  'visible',
  'occluded',
  'not_in_frame'
]);

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const readTrimmedString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const readFiniteNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const readMetadata = (value: unknown): Record<string, unknown> | undefined => {
  const metadata = asRecord(value);
  return Object.keys(metadata).length ? metadata : undefined;
};

const readBasePredictionFields = (
  value: Record<string, unknown>
): TaskPreAnnotationBase => {
  const base: TaskPreAnnotationBase = {};
  const id = readTrimmedString(value.id);
  const label = readTrimmedString(value.label);
  const score = readFiniteNumber(value.score);
  const metadata = readMetadata(value.metadata);

  if (id) {
    base.id = id;
  }
  if (label) {
    base.label = label;
  }
  if (score !== undefined) {
    base.score = score;
  }
  if (metadata) {
    base.metadata = metadata;
  }

  return base;
};

const readImagePoint = (value: unknown): ImagePoint | null => {
  const point = asRecord(value);
  const x = readFiniteNumber(point.x);
  const y = readFiniteNumber(point.y);

  if (x === undefined || y === undefined) {
    return null;
  }

  return { x, y };
};

const readImageRect = (value: unknown): ImageRect | null => {
  const rect = asRecord(value);
  const x = readFiniteNumber(rect.x);
  const y = readFiniteNumber(rect.y);
  const width = readFiniteNumber(rect.width);
  const height = readFiniteNumber(rect.height);

  if (
    x === undefined ||
    y === undefined ||
    width === undefined ||
    height === undefined ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }

  return { x, y, width, height };
};

const readBboxPrediction = (
  value: Record<string, unknown>
): TaskPreAnnotationBbox | null => {
  const bbox = readImageRect(value.bbox);
  if (!bbox) {
    return null;
  }

  return {
    kind: 'bbox',
    ...readBasePredictionFields(value),
    bbox
  };
};

const readPolygonPrediction = (
  value: Record<string, unknown>
): TaskPreAnnotationPolygon | null => {
  const rawPoints = Array.isArray(value.points) ? value.points : [];
  const points = rawPoints
    .map((point) => readImagePoint(point))
    .filter((point): point is ImagePoint => point !== null);

  if (points.length < 3) {
    return null;
  }

  return {
    kind: 'polygon',
    ...readBasePredictionFields(value),
    points
  };
};

const readKeypoint = (value: unknown): TaskPreAnnotationKeypoint | null => {
  const keypoint = asRecord(value);
  const id = readTrimmedString(keypoint.id);
  if (!id) {
    return null;
  }

  const nextKeypoint: TaskPreAnnotationKeypoint = {
    id,
    point: keypoint.point === null ? null : readImagePoint(keypoint.point)
  };

  if (keypoint.point !== null && nextKeypoint.point === null) {
    return null;
  }

  const label = readTrimmedString(keypoint.label);
  const state = readTrimmedString(keypoint.state);

  if (label) {
    nextKeypoint.label = label;
  }
  if (state && PRE_ANNOTATION_KEYPOINT_STATES.has(state as TaskPreAnnotationKeypointState)) {
    nextKeypoint.state = state as TaskPreAnnotationKeypointState;
  }

  return nextKeypoint;
};

const readKeypointsPrediction = (
  value: Record<string, unknown>
): TaskPreAnnotationKeypoints | null => {
  const rawKeypoints = Array.isArray(value.keypoints) ? value.keypoints : [];
  const keypoints = rawKeypoints
    .map((keypoint) => readKeypoint(keypoint))
    .filter((keypoint): keypoint is TaskPreAnnotationKeypoint => keypoint !== null);

  if (!keypoints.length) {
    return null;
  }

  return {
    kind: 'keypoints',
    ...readBasePredictionFields(value),
    keypoints
  };
};

const readPrediction = (value: unknown): TaskPreAnnotation | null => {
  const prediction = asRecord(value);
  const kind = readTrimmedString(prediction.kind);

  if (!kind) {
    return null;
  }

  switch (kind) {
    case 'bbox':
      return readBboxPrediction(prediction);
    case 'polygon':
      return readPolygonPrediction(prediction);
    case 'keypoints':
      return readKeypointsPrediction(prediction);
    default:
      return null;
  }
};

export const readTaskPreAnnotations = (
  payload: Record<string, unknown>
): TaskPreAnnotations | null => {
  const envelope = asRecord(payload.pre_annotations);
  const schemaVersion = readTrimmedString(envelope.schema_version);
  const rawPredictions = Array.isArray(envelope.predictions) ? envelope.predictions : null;

  if (
    schemaVersion !== PRE_ANNOTATIONS_SCHEMA_VERSION ||
    rawPredictions === null
  ) {
    return null;
  }

  const predictions = rawPredictions
    .map((prediction) => readPrediction(prediction))
    .filter((prediction): prediction is TaskPreAnnotation => prediction !== null);
  const metadata = readMetadata(envelope.metadata);

  return {
    schema_version: schemaVersion,
    predictions,
    ...(metadata ? { metadata } : {})
  };
};
