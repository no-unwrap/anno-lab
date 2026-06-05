import type { ImagePoint } from '@anno-lab/shared';

import {
  createPolygon,
  insertPolygonVertex,
  movePolygon,
  removePolygonVertex,
  removePolygon,
  replacePolygonVertex
} from './salientGeometry';
import type { PolygonObject, VertexDragState } from './types';

const HISTORY_LIMIT = 50;

export interface SalientEditorSnapshot {
  polygons: PolygonObject[];
  draftPoints: ImagePoint[];
  selectedPolygonId: string | null;
}

interface SalientEditorHistoryState {
  past: SalientEditorSnapshot[];
  future: SalientEditorSnapshot[];
  dragSnapshot: SalientEditorSnapshot | null;
}

export interface SalientEditorState {
  polygons: PolygonObject[];
  draftPoints: ImagePoint[];
  selectedPolygonId: string | null;
  interaction: VertexDragState | null;
  history: SalientEditorHistoryState;
}

export type SalientEditorAction =
  | { type: 'reset' }
  | { type: 'select_polygon'; polygonId: string | null }
  | { type: 'append_draft_point'; point: ImagePoint }
  | { type: 'reset_draft' }
  | { type: 'undo_draft_point' }
  | { type: 'close_draft'; polygonId: string; label?: string }
  | { type: 'delete_selected_polygon' }
  | { type: 'move_polygon'; polygonId: string; targetIndex: number }
  | {
      type: 'insert_polygon_vertex';
      polygonId: string;
      afterVertexIndex: number;
      point: ImagePoint;
    }
  | {
      type: 'remove_polygon_vertex';
      polygonId: string;
      vertexIndex: number;
      minimumPoints: number;
    }
  | { type: 'clear_all' }
  | { type: 'start_dragging_vertex'; drag: VertexDragState }
  | { type: 'update_dragging_vertex'; point: ImagePoint }
  | { type: 'cancel_interaction' }
  | { type: 'clear_interaction' }
  | { type: 'undo' }
  | { type: 'redo' };

const trimHistory = (
  snapshots: SalientEditorSnapshot[]
): SalientEditorSnapshot[] =>
  snapshots.length > HISTORY_LIMIT
    ? snapshots.slice(snapshots.length - HISTORY_LIMIT)
    : snapshots;

export const createSalientEditorSnapshot = (
  state: Pick<SalientEditorState, 'polygons' | 'draftPoints' | 'selectedPolygonId'>
): SalientEditorSnapshot => ({
  polygons: state.polygons,
  draftPoints: state.draftPoints,
  selectedPolygonId: state.selectedPolygonId
});

const arePointsEqual = (left: ImagePoint[], right: ImagePoint[]): boolean =>
  left.length === right.length &&
  left.every(
    (point, index) =>
      point.x === right[index]?.x && point.y === right[index]?.y
  );

const arePolygonsEqual = (
  left: PolygonObject[],
  right: PolygonObject[]
): boolean =>
  left.length === right.length &&
  left.every((polygon, index) => {
    const candidate = right[index];
    if (!candidate) {
      return false;
    }

    return (
      polygon.id === candidate.id &&
      polygon.label === candidate.label &&
      arePointsEqual(polygon.points, candidate.points)
    );
  });

export const areSalientEditorSnapshotsEqual = (
  left: SalientEditorSnapshot,
  right: SalientEditorSnapshot
): boolean =>
  left.selectedPolygonId === right.selectedPolygonId &&
  arePointsEqual(left.draftPoints, right.draftPoints) &&
  arePolygonsEqual(left.polygons, right.polygons);

const restoreSnapshot = (
  state: SalientEditorState,
  snapshot: SalientEditorSnapshot,
  history: SalientEditorHistoryState
): SalientEditorState => ({
  ...state,
  polygons: snapshot.polygons,
  draftPoints: snapshot.draftPoints,
  selectedPolygonId: snapshot.selectedPolygonId,
  interaction: null,
  history
});

const applyCommittedSnapshot = (
  state: SalientEditorState,
  snapshot: SalientEditorSnapshot
): SalientEditorState => {
  const currentSnapshot = createSalientEditorSnapshot(state);
  if (areSalientEditorSnapshotsEqual(currentSnapshot, snapshot)) {
    return state;
  }

  return restoreSnapshot(state, snapshot, {
    past: trimHistory([...state.history.past, currentSnapshot]),
    future: [],
    dragSnapshot: null
  });
};

export const createSalientEditorState = (): SalientEditorState => ({
  polygons: [],
  draftPoints: [],
  selectedPolygonId: null,
  interaction: null,
  history: {
    past: [],
    future: [],
    dragSnapshot: null
  }
});

export const getSelectedPolygon = (
  state: SalientEditorState
): PolygonObject | null =>
  state.selectedPolygonId
    ? state.polygons.find((polygon) => polygon.id === state.selectedPolygonId) ?? null
    : null;

export const getSelectedPolygonIndex = (state: SalientEditorState): number =>
  state.selectedPolygonId
    ? state.polygons.findIndex((polygon) => polygon.id === state.selectedPolygonId)
    : -1;

export const hasDraftPoints = (state: SalientEditorState): boolean =>
  state.draftPoints.length > 0;

export const canCloseDraftPolygon = (
  state: SalientEditorState,
  minPoints: number
): boolean => state.draftPoints.length >= minPoints;

export const canUndoEditorChange = (state: SalientEditorState): boolean =>
  state.history.past.length > 0;

export const canRedoEditorChange = (state: SalientEditorState): boolean =>
  state.history.future.length > 0;

export const salientEditorReducer = (
  state: SalientEditorState,
  action: SalientEditorAction
): SalientEditorState => {
  switch (action.type) {
    case 'reset':
      return createSalientEditorState();
    case 'select_polygon':
      return {
        ...state,
        selectedPolygonId: action.polygonId
      };
    case 'append_draft_point':
      return applyCommittedSnapshot(state, {
        polygons: state.polygons,
        draftPoints: [...state.draftPoints, action.point],
        selectedPolygonId: null
      });
    case 'reset_draft':
      return applyCommittedSnapshot(state, {
        polygons: state.polygons,
        draftPoints: [],
        selectedPolygonId: state.selectedPolygonId
      });
    case 'undo_draft_point':
      return applyCommittedSnapshot(state, {
        polygons: state.polygons,
        draftPoints: state.draftPoints.slice(0, -1),
        selectedPolygonId: state.selectedPolygonId
      });
    case 'close_draft': {
      if (!state.draftPoints.length) {
        return state;
      }

      const nextPolygon = createPolygon(state.draftPoints, {
        id: action.polygonId,
        label: action.label
      });

      return applyCommittedSnapshot(state, {
        polygons: [...state.polygons, nextPolygon],
        draftPoints: [],
        selectedPolygonId: nextPolygon.id
      });
    }
    case 'delete_selected_polygon':
      if (!state.selectedPolygonId) {
        return state;
      }

      return applyCommittedSnapshot(state, {
        polygons: removePolygon(state.polygons, state.selectedPolygonId),
        draftPoints: state.draftPoints,
        selectedPolygonId: null
      });
    case 'move_polygon':
      if (!state.polygons.some((polygon) => polygon.id === action.polygonId)) {
        return state;
      }

      return applyCommittedSnapshot(state, {
        polygons: movePolygon(state.polygons, action.polygonId, action.targetIndex),
        draftPoints: state.draftPoints,
        selectedPolygonId: action.polygonId
      });
    case 'insert_polygon_vertex':
      return applyCommittedSnapshot(state, {
        polygons: insertPolygonVertex(
          state.polygons,
          action.polygonId,
          action.afterVertexIndex,
          action.point
        ),
        draftPoints: state.draftPoints,
        selectedPolygonId: action.polygonId
      });
    case 'remove_polygon_vertex':
      return applyCommittedSnapshot(state, {
        polygons: removePolygonVertex(
          state.polygons,
          action.polygonId,
          action.vertexIndex,
          action.minimumPoints
        ),
        draftPoints: state.draftPoints,
        selectedPolygonId: action.polygonId
      });
    case 'clear_all':
      return applyCommittedSnapshot(state, {
        polygons: [],
        draftPoints: [],
        selectedPolygonId: null
      });
    case 'start_dragging_vertex':
      return {
        ...state,
        selectedPolygonId: action.drag.polygonId,
        interaction: action.drag,
        history: {
          ...state.history,
          dragSnapshot: {
            ...createSalientEditorSnapshot(state),
            selectedPolygonId: action.drag.polygonId
          }
        }
      };
    case 'update_dragging_vertex':
      if (!state.interaction) {
        return state;
      }

      return {
        ...state,
        polygons: replacePolygonVertex(state.polygons, state.interaction, action.point)
      };
    case 'cancel_interaction':
      if (!state.interaction && !state.history.dragSnapshot) {
        return state;
      }

      if (!state.history.dragSnapshot) {
        return {
          ...state,
          interaction: null
        };
      }

      return restoreSnapshot(state, state.history.dragSnapshot, {
        past: state.history.past,
        future: state.history.future,
        dragSnapshot: null
      });
    case 'clear_interaction':
      if (!state.interaction && !state.history.dragSnapshot) {
        return state;
      }

      if (!state.history.dragSnapshot) {
        return {
          ...state,
          interaction: null
        };
      }

      if (
        areSalientEditorSnapshotsEqual(
          state.history.dragSnapshot,
          createSalientEditorSnapshot(state)
        )
      ) {
        return {
          ...state,
          interaction: null,
          history: {
            ...state.history,
            dragSnapshot: null
          }
        };
      }

      return restoreSnapshot(state, createSalientEditorSnapshot(state), {
        past: trimHistory([...state.history.past, state.history.dragSnapshot]),
        future: [],
        dragSnapshot: null
      });
    case 'undo': {
      const previousSnapshot = state.history.past[state.history.past.length - 1];
      if (!previousSnapshot) {
        return state;
      }

      return restoreSnapshot(state, previousSnapshot, {
        past: state.history.past.slice(0, -1),
        future: trimHistory([
          ...state.history.future,
          createSalientEditorSnapshot(state)
        ]),
        dragSnapshot: null
      });
    }
    case 'redo': {
      const nextSnapshot = state.history.future[state.history.future.length - 1];
      if (!nextSnapshot) {
        return state;
      }

      return restoreSnapshot(state, nextSnapshot, {
        past: trimHistory([
          ...state.history.past,
          createSalientEditorSnapshot(state)
        ]),
        future: state.history.future.slice(0, -1),
        dragSnapshot: null
      });
    }
    default:
      return state;
  }
};
