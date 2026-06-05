import type { ImagePoint } from '@anno-lab/shared';

export interface PoseDefinition {
  instructions?: string;
  subject_label?: string;
  landmarks?: unknown[];
  skeleton?: unknown[];
}

export interface LandmarkDefinition {
  id: string;
  label: string;
  color: string;
}

export interface SkeletonEdge {
  from: string;
  to: string;
}

export type KeypointState = 'pending' | 'visible' | 'occluded' | 'not_in_frame';

export type DragKeypointState = Extract<KeypointState, 'visible' | 'occluded'>;

export interface Keypoint {
  landmarkId: string;
  label: string;
  color: string;
  state: KeypointState;
  point: ImagePoint | null;
}

export type ToolMode = 'place' | 'select';

export type InteractionState =
  | null
  | { type: 'dragging'; landmarkId: string; state: DragKeypointState };

export interface ClientPoint {
  clientX: number;
  clientY: number;
}
