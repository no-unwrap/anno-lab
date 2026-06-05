import { imagePointToDisplay } from '@anno-lab/shared';
import type { DisplayPoint, ImageMetrics, ImagePoint } from '@anno-lab/shared';

import { SALIENT_OBJECT_LABEL } from './constants';
import type {
  DisplayPolygon,
  PolygonInsertHandle,
  PolygonObject,
  VertexDragState
} from './types';

export const createPolygonId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `salient-poly-${crypto.randomUUID()}`;
  }
  return `salient-poly-${Date.now()}`;
};

export const formatPolygonName = (index: number): string => `Object ${index + 1}`;

export const formatPointPath = (points: DisplayPoint[]): string =>
  points.map((point) => `${point.x},${point.y}`).join(' ');

export const createPolygon = (
  points: ImagePoint[],
  options: { id?: string; label?: string } = {}
): PolygonObject => ({
  id: options.id ?? createPolygonId(),
  label: options.label ?? SALIENT_OBJECT_LABEL,
  points: points.map((point) => ({ ...point }))
});

export const removePolygon = (
  polygons: PolygonObject[],
  polygonId: string
): PolygonObject[] => polygons.filter((polygon) => polygon.id !== polygonId);

export const movePolygon = (
  polygons: PolygonObject[],
  polygonId: string,
  targetIndex: number
): PolygonObject[] => {
  const currentIndex = polygons.findIndex((polygon) => polygon.id === polygonId);
  if (
    currentIndex < 0 ||
    targetIndex < 0 ||
    targetIndex >= polygons.length ||
    currentIndex === targetIndex
  ) {
    return polygons;
  }

  const nextPolygons = polygons.slice();
  const [polygon] = nextPolygons.splice(currentIndex, 1);
  if (!polygon) {
    return polygons;
  }

  nextPolygons.splice(targetIndex, 0, polygon);
  return nextPolygons;
};

export const getPolygonInsertPoint = (
  polygon: Pick<PolygonObject, 'points'>,
  afterVertexIndex: number
): ImagePoint | null => {
  if (
    afterVertexIndex < 0 ||
    afterVertexIndex >= polygon.points.length ||
    polygon.points.length < 2
  ) {
    return null;
  }

  const currentPoint = polygon.points[afterVertexIndex];
  const nextPoint = polygon.points[(afterVertexIndex + 1) % polygon.points.length];
  if (!currentPoint || !nextPoint) {
    return null;
  }

  return {
    x: (currentPoint.x + nextPoint.x) / 2,
    y: (currentPoint.y + nextPoint.y) / 2
  };
};

export const insertPolygonVertex = (
  polygons: PolygonObject[],
  polygonId: string,
  afterVertexIndex: number,
  point: ImagePoint
): PolygonObject[] => {
  const polygon = polygons.find((candidate) => candidate.id === polygonId);
  if (!polygon || afterVertexIndex < 0 || afterVertexIndex >= polygon.points.length) {
    return polygons;
  }

  return polygons.map((candidate) =>
    candidate.id === polygonId
      ? {
          ...candidate,
          points: [
            ...candidate.points.slice(0, afterVertexIndex + 1),
            { ...point },
            ...candidate.points.slice(afterVertexIndex + 1)
          ]
        }
      : candidate
  );
};

export const removePolygonVertex = (
  polygons: PolygonObject[],
  polygonId: string,
  vertexIndex: number,
  minimumPoints: number
): PolygonObject[] => {
  const polygon = polygons.find((candidate) => candidate.id === polygonId);
  if (
    !polygon ||
    vertexIndex < 0 ||
    vertexIndex >= polygon.points.length ||
    polygon.points.length <= minimumPoints
  ) {
    return polygons;
  }

  return polygons.map((candidate) =>
    candidate.id === polygonId
      ? {
          ...candidate,
          points: candidate.points.filter((_, index) => index !== vertexIndex)
        }
      : candidate
  );
};

export const replacePolygonVertex = (
  polygons: PolygonObject[],
  dragState: VertexDragState,
  point: ImagePoint
): PolygonObject[] =>
  polygons.map((polygon) =>
    polygon.id === dragState.polygonId
      ? {
          ...polygon,
          points: polygon.points.map((currentPoint, index) =>
            index === dragState.vertexIndex ? point : currentPoint
          )
        }
      : polygon
  );

export const buildDisplayPolygons = (
  polygons: PolygonObject[],
  metrics: ImageMetrics | null
): DisplayPolygon[] =>
  polygons.map((polygon, index) => {
    const displayPoints = metrics
      ? polygon.points.map((point) => imagePointToDisplay(point, metrics))
      : [];
    return {
      ...polygon,
      index,
      displayPoints,
      path: formatPointPath(displayPoints)
    };
  });

export const buildPolygonInsertHandles = (
  polygon: DisplayPolygon
): PolygonInsertHandle[] =>
  polygon.displayPoints.map((point, afterVertexIndex) => {
    const nextPoint =
      polygon.displayPoints[(afterVertexIndex + 1) % polygon.displayPoints.length];

    return {
      polygonId: polygon.id,
      afterVertexIndex,
      x: (point.x + (nextPoint?.x ?? point.x)) / 2,
      y: (point.y + (nextPoint?.y ?? point.y)) / 2
    };
  });

export const buildPolygonSubmissionObjects = (polygons: PolygonObject[]) =>
  polygons.map((polygon) => ({
    id: polygon.id,
    type: 'polygon',
    label: polygon.label,
    points: polygon.points.map((point) => [
      Number(point.x.toFixed(2)),
      Number(point.y.toFixed(2))
    ])
  }));
