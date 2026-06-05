import type { DisplayPoint, ImagePoint } from '@anno-lab/shared';

export interface SalientDefinition {
  instructions?: string;
  min_points?: number;
}

export interface PolygonObject {
  id: string;
  label: string;
  points: ImagePoint[];
}

export interface DisplayPolygon extends PolygonObject {
  index: number;
  displayPoints: DisplayPoint[];
  path: string;
}

export interface PolygonInsertHandle {
  polygonId: string;
  afterVertexIndex: number;
  x: number;
  y: number;
}

export interface VertexDragState {
  polygonId: string;
  polygonIndex: number;
  vertexIndex: number;
}

export interface ClientPoint {
  clientX: number;
  clientY: number;
}
