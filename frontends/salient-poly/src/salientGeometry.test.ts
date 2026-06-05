import { describe, expect, it } from 'vitest';

import {
  buildPolygonInsertHandles,
  buildPolygonSubmissionObjects,
  getPolygonInsertPoint,
  insertPolygonVertex,
  movePolygon,
  removePolygonVertex,
  replacePolygonVertex
} from './salientGeometry';
import type { DisplayPolygon, PolygonObject } from './types';

describe('salientGeometry', () => {
  it('replaces only the targeted polygon vertex during refinement', () => {
    const polygons: PolygonObject[] = [
      {
        id: 'poly-1',
        label: 'salient_object',
        points: [
          { x: 10, y: 20 },
          { x: 30, y: 40 },
          { x: 50, y: 60 }
        ]
      },
      {
        id: 'poly-2',
        label: 'salient_object',
        points: [
          { x: 100, y: 110 },
          { x: 120, y: 130 },
          { x: 140, y: 150 }
        ]
      }
    ];

    const nextPolygons = replacePolygonVertex(
      polygons,
      {
        polygonId: 'poly-1',
        polygonIndex: 0,
        vertexIndex: 1
      },
      { x: 32, y: 48 }
    );

    expect(nextPolygons[0]?.points).toEqual([
      { x: 10, y: 20 },
      { x: 32, y: 48 },
      { x: 50, y: 60 }
    ]);
    expect(nextPolygons[1]?.points).toEqual(polygons[1]?.points);
  });

  it('moves a polygon to a new array position without changing its geometry', () => {
    const polygons: PolygonObject[] = [
      {
        id: 'poly-1',
        label: 'salient_object',
        points: [
          { x: 10, y: 20 },
          { x: 30, y: 40 },
          { x: 50, y: 60 }
        ]
      },
      {
        id: 'poly-2',
        label: 'salient_object',
        points: [
          { x: 100, y: 110 },
          { x: 120, y: 130 },
          { x: 140, y: 150 }
        ]
      }
    ];

    const nextPolygons = movePolygon(polygons, 'poly-2', 0);

    expect(nextPolygons.map((polygon) => polygon.id)).toEqual(['poly-2', 'poly-1']);
    expect(nextPolygons[0]?.points).toEqual(polygons[1]?.points);
    expect(nextPolygons[1]?.points).toEqual(polygons[0]?.points);
  });

  it('inserts a new vertex between the requested polygon points', () => {
    const polygons: PolygonObject[] = [
      {
        id: 'poly-1',
        label: 'salient_object',
        points: [
          { x: 10, y: 20 },
          { x: 30, y: 40 },
          { x: 50, y: 60 }
        ]
      }
    ];

    const insertPoint = getPolygonInsertPoint(polygons[0], 0);
    const nextPolygons = insertPoint
      ? insertPolygonVertex(polygons, 'poly-1', 0, insertPoint)
      : polygons;

    expect(insertPoint).toEqual({ x: 20, y: 30 });
    expect(nextPolygons[0]?.points).toEqual([
      { x: 10, y: 20 },
      { x: 20, y: 30 },
      { x: 30, y: 40 },
      { x: 50, y: 60 }
    ]);
  });

  it('removes a targeted vertex while preserving the minimum polygon size', () => {
    const polygons: PolygonObject[] = [
      {
        id: 'poly-1',
        label: 'salient_object',
        points: [
          { x: 10, y: 20 },
          { x: 20, y: 30 },
          { x: 30, y: 40 },
          { x: 50, y: 60 }
        ]
      }
    ];

    const nextPolygons = removePolygonVertex(polygons, 'poly-1', 1, 3);
    const blockedPolygons = removePolygonVertex(nextPolygons, 'poly-1', 0, 3);

    expect(nextPolygons[0]?.points).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 50, y: 60 }
    ]);
    expect(blockedPolygons).toEqual(nextPolygons);
  });

  it('builds insert handles between each visible polygon edge', () => {
    const polygon: DisplayPolygon = {
      id: 'poly-1',
      index: 0,
      label: 'salient_object',
      path: '10,20 30,40 50,20',
      points: [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
        { x: 50, y: 20 }
      ],
      displayPoints: [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
        { x: 50, y: 20 }
      ]
    };

    expect(buildPolygonInsertHandles(polygon)).toEqual([
      { polygonId: 'poly-1', afterVertexIndex: 0, x: 20, y: 30 },
      { polygonId: 'poly-1', afterVertexIndex: 1, x: 40, y: 30 },
      { polygonId: 'poly-1', afterVertexIndex: 2, x: 30, y: 20 }
    ]);
  });

  it('formats submission objects with two-decimal polygon coordinates', () => {
    const payload = buildPolygonSubmissionObjects([
      {
        id: 'poly-1',
        label: 'salient_object',
        points: [
          { x: 10.1234, y: 20.5678 },
          { x: 30, y: 40.1 },
          { x: 50.555, y: 60.444 }
        ]
      }
    ]);

    expect(payload).toEqual([
      {
        id: 'poly-1',
        type: 'polygon',
        label: 'salient_object',
        points: [
          [10.12, 20.57],
          [30, 40.1],
          [50.55, 60.44]
        ]
      }
    ]);
  });
});
