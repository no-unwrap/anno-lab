import type { ImagePoint } from '@anno-lab/shared';

import { createDraggingInteraction } from './poseInteractions';
import type {
  DragKeypointState,
  InteractionState,
  Keypoint,
  KeypointState,
  LandmarkDefinition,
  ToolMode
} from './types';

const HISTORY_LIMIT = 50;

export interface PoseEditorSnapshot {
  keypoints: Keypoint[];
  selectedLandmarkId: string | null;
}

interface PoseEditorHistoryState {
  past: PoseEditorSnapshot[];
  future: PoseEditorSnapshot[];
  dragSnapshot: PoseEditorSnapshot | null;
}

export interface PoseEditorState {
  keypoints: Keypoint[];
  mode: ToolMode;
  selectedLandmarkId: string | null;
  interaction: InteractionState;
  history: PoseEditorHistoryState;
}

export type PoseEditorAction =
  | { type: 'reset'; landmarks: LandmarkDefinition[] }
  | { type: 'set_mode'; mode: ToolMode }
  | { type: 'select'; landmarkId: string | null }
  | { type: 'move_selection'; step: number }
  | {
      type: 'place_landmark';
      landmarkId: string;
      point: ImagePoint;
      autoAdvance?: boolean;
    }
  | { type: 'set_selected_state'; state: KeypointState }
  | { type: 'clear_selected' }
  | {
      type: 'start_dragging';
      landmarkId: string;
      point: ImagePoint;
      state: DragKeypointState;
    }
  | { type: 'update_dragging'; point: ImagePoint }
  | { type: 'cancel_interaction' }
  | { type: 'clear_interaction' }
  | { type: 'undo' }
  | { type: 'redo' };

const trimHistory = (
  snapshots: PoseEditorSnapshot[]
): PoseEditorSnapshot[] =>
  snapshots.length > HISTORY_LIMIT
    ? snapshots.slice(snapshots.length - HISTORY_LIMIT)
    : snapshots;

export const createPoseEditorSnapshot = (
  state: Pick<PoseEditorState, 'keypoints' | 'selectedLandmarkId'>
): PoseEditorSnapshot => ({
  keypoints: state.keypoints,
  selectedLandmarkId: state.selectedLandmarkId
});

const areImagePointsEqual = (
  left: ImagePoint | null,
  right: ImagePoint | null
): boolean => {
  if (!left || !right) {
    return left === right;
  }

  return left.x === right.x && left.y === right.y;
};

const areKeypointsEqual = (left: Keypoint[], right: Keypoint[]): boolean =>
  left.length === right.length &&
  left.every((keypoint, index) => {
    const candidate = right[index];
    if (!candidate) {
      return false;
    }

    return (
      keypoint.landmarkId === candidate.landmarkId &&
      keypoint.label === candidate.label &&
      keypoint.color === candidate.color &&
      keypoint.state === candidate.state &&
      areImagePointsEqual(keypoint.point, candidate.point)
    );
  });

export const arePoseEditorSnapshotsEqual = (
  left: PoseEditorSnapshot,
  right: PoseEditorSnapshot
): boolean =>
  left.selectedLandmarkId === right.selectedLandmarkId &&
  areKeypointsEqual(left.keypoints, right.keypoints);

const restoreSnapshot = (
  state: PoseEditorState,
  snapshot: PoseEditorSnapshot,
  history: PoseEditorHistoryState
): PoseEditorState => ({
  ...state,
  keypoints: snapshot.keypoints,
  selectedLandmarkId: snapshot.selectedLandmarkId,
  interaction: null,
  history
});

const applyCommittedSnapshot = (
  state: PoseEditorState,
  snapshot: PoseEditorSnapshot
): PoseEditorState => {
  const currentSnapshot = createPoseEditorSnapshot(state);
  if (arePoseEditorSnapshotsEqual(currentSnapshot, snapshot)) {
    return state;
  }

  return restoreSnapshot(state, snapshot, {
    past: trimHistory([...state.history.past, currentSnapshot]),
    future: [],
    dragSnapshot: null
  });
};

export const formatPixels = (value: number): string => `${Math.round(value)} px`;
export const createKeypoints = (landmarks: LandmarkDefinition[]): Keypoint[] =>
  landmarks.map((landmark) => ({
    landmarkId: landmark.id,
    label: landmark.label,
    color: landmark.color,
    state: 'pending',
    point: null
  }));

export const createPoseEditorState = (
  landmarks: LandmarkDefinition[]
): PoseEditorState => {
  const keypoints = createKeypoints(landmarks);
  return {
    keypoints,
    mode: 'place',
    selectedLandmarkId: keypoints[0]?.landmarkId ?? null,
    interaction: null,
    history: {
      past: [],
      future: [],
      dragSnapshot: null
    }
  };
};

export const getStatusLabel = (state: KeypointState): string => {
  if (state === 'visible') {
    return 'Visible';
  }
  if (state === 'occluded') {
    return 'Occluded';
  }
  if (state === 'not_in_frame') {
    return 'Not in frame';
  }
  return 'Pending';
};

export const isResolved = (state: KeypointState): boolean => state !== 'pending';

export const getKeypointById = (
  keypoints: Keypoint[],
  landmarkId?: string | null
): Keypoint | null =>
  landmarkId
    ? keypoints.find((keypoint) => keypoint.landmarkId === landmarkId) ?? null
    : null;

export const getSelectedKeypoint = (state: PoseEditorState): Keypoint | null =>
  getKeypointById(state.keypoints, state.selectedLandmarkId);

export const canUndoPoseEditorChange = (state: PoseEditorState): boolean =>
  state.history.past.length > 0;

export const canRedoPoseEditorChange = (state: PoseEditorState): boolean =>
  state.history.future.length > 0;

export const getNextPendingLandmarkId = (
  keypoints: Keypoint[],
  currentId?: string | null
): string | null => {
  if (!keypoints.length) {
    return null;
  }

  const currentIndex = currentId
    ? keypoints.findIndex((keypoint) => keypoint.landmarkId === currentId)
    : -1;

  for (let offset = 1; offset <= keypoints.length; offset += 1) {
    const candidate = keypoints[(currentIndex + offset + keypoints.length) % keypoints.length];
    if (candidate.state === 'pending') {
      return candidate.landmarkId;
    }
  }

  return currentId ?? keypoints[0].landmarkId;
};

export const getSelectionStepTarget = (
  keypoints: Keypoint[],
  currentId: string | null,
  step: number
): Keypoint | null => {
  if (!keypoints.length) {
    return null;
  }

  const currentIndex = currentId
    ? keypoints.findIndex((keypoint) => keypoint.landmarkId === currentId)
    : -1;
  const fallbackIndex = step >= 0 ? 0 : keypoints.length - 1;
  const nextIndex =
    currentIndex === -1
      ? fallbackIndex
      : (currentIndex + step + keypoints.length) % keypoints.length;

  return keypoints[nextIndex] ?? null;
};

const mapKeypoints = (
  keypoints: Keypoint[],
  landmarkId: string,
  updater: (keypoint: Keypoint) => Keypoint
): Keypoint[] =>
  keypoints.map((keypoint) =>
    keypoint.landmarkId === landmarkId ? updater(keypoint) : keypoint
  );

export const applySelectionStep = (
  state: PoseEditorState,
  step: number
): PoseEditorState => {
  const nextLandmark = getSelectionStepTarget(
    state.keypoints,
    state.selectedLandmarkId,
    step
  );
  if (!nextLandmark) {
    return state;
  }

  return {
    ...state,
    selectedLandmarkId: nextLandmark.landmarkId
  };
};

export const applyLandmarkPlacement = (
  state: PoseEditorState,
  landmarkId: string,
  point: ImagePoint,
  options: { autoAdvance?: boolean } = {}
): PoseEditorState => {
  const currentKeypoint = getKeypointById(state.keypoints, landmarkId);
  if (!currentKeypoint) {
    return state;
  }

  const keypoints = mapKeypoints(state.keypoints, landmarkId, (keypoint) => ({
    ...keypoint,
    point,
    state: keypoint.state === 'occluded' ? 'occluded' : 'visible'
  }));
  const selectedLandmarkId =
    options.autoAdvance === false
      ? landmarkId
      : getNextPendingLandmarkId(keypoints, landmarkId);

  return {
    ...state,
    keypoints,
    selectedLandmarkId
  };
};

export const applySelectedKeypointState = (
  state: PoseEditorState,
  nextState: KeypointState
): PoseEditorState => {
  if (!state.selectedLandmarkId) {
    return state;
  }

  const keypoints = mapKeypoints(
    state.keypoints,
    state.selectedLandmarkId,
    (keypoint) => ({
      ...keypoint,
      state: nextState,
      point: nextState === 'not_in_frame' ? null : keypoint.point
    })
  );
  const selectedLandmarkId =
    nextState === 'not_in_frame'
      ? getNextPendingLandmarkId(keypoints, state.selectedLandmarkId)
      : state.selectedLandmarkId;

  return {
    ...state,
    keypoints,
    selectedLandmarkId
  };
};

export const applySelectedKeypointClear = (
  state: PoseEditorState
): PoseEditorState => {
  if (!state.selectedLandmarkId) {
    return state;
  }

  return {
    ...state,
    keypoints: mapKeypoints(state.keypoints, state.selectedLandmarkId, (keypoint) => ({
      ...keypoint,
      point: null,
      state: 'pending'
    }))
  };
};

export const applyDraggingStart = (
  state: PoseEditorState,
  landmarkId: string,
  point: ImagePoint,
  dragState: DragKeypointState
): PoseEditorState => ({
  ...state,
  keypoints: mapKeypoints(state.keypoints, landmarkId, (keypoint) => ({
    ...keypoint,
    point,
    state: dragState
  })),
  selectedLandmarkId: landmarkId,
  interaction: createDraggingInteraction(landmarkId, dragState),
  history: {
    ...state.history,
    dragSnapshot: {
      ...createPoseEditorSnapshot(state),
      selectedLandmarkId: landmarkId
    }
  }
});

export const applyDraggingPoint = (
  state: PoseEditorState,
  point: ImagePoint
): PoseEditorState => {
  if (!state.interaction || state.interaction.type !== 'dragging') {
    return state;
  }

  return {
    ...state,
    keypoints: mapKeypoints(
      state.keypoints,
      state.interaction.landmarkId,
      (keypoint) => ({
        ...keypoint,
        point,
        state: state.interaction?.type === 'dragging'
          ? state.interaction.state
          : keypoint.state
      })
    )
  };
};

export const applyInteractionClear = (
  state: PoseEditorState
): PoseEditorState => {
  if (!state.interaction && !state.history.dragSnapshot) {
    return state;
  }

  if (!state.history.dragSnapshot) {
    return {
      ...state,
      interaction: null
    };
  }

  const currentSnapshot = createPoseEditorSnapshot(state);
  if (arePoseEditorSnapshotsEqual(state.history.dragSnapshot, currentSnapshot)) {
    return {
      ...state,
      interaction: null,
      history: {
        ...state.history,
        dragSnapshot: null
      }
    };
  }

  return restoreSnapshot(state, currentSnapshot, {
    past: trimHistory([...state.history.past, state.history.dragSnapshot]),
    future: [],
    dragSnapshot: null
  });
};

export const applyInteractionCancel = (
  state: PoseEditorState
): PoseEditorState => {
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
};

export const poseEditorReducer = (
  state: PoseEditorState,
  action: PoseEditorAction
): PoseEditorState => {
  switch (action.type) {
    case 'reset':
      return createPoseEditorState(action.landmarks);
    case 'set_mode':
      return {
        ...state,
        mode: action.mode
      };
    case 'select':
      return {
        ...state,
        selectedLandmarkId: action.landmarkId
      };
    case 'move_selection':
      return applySelectionStep(state, action.step);
    case 'place_landmark':
      return applyCommittedSnapshot(
        state,
        createPoseEditorSnapshot(
          applyLandmarkPlacement(state, action.landmarkId, action.point, {
            autoAdvance: action.autoAdvance
          })
        )
      );
    case 'set_selected_state':
      return applyCommittedSnapshot(
        state,
        createPoseEditorSnapshot(applySelectedKeypointState(state, action.state))
      );
    case 'clear_selected':
      return applyCommittedSnapshot(
        state,
        createPoseEditorSnapshot(applySelectedKeypointClear(state))
      );
    case 'start_dragging':
      return applyDraggingStart(
        state,
        action.landmarkId,
        action.point,
        action.state
      );
    case 'update_dragging':
      return applyDraggingPoint(state, action.point);
    case 'cancel_interaction':
      return applyInteractionCancel(state);
    case 'clear_interaction':
      return applyInteractionClear(state);
    case 'undo': {
      if (state.interaction) {
        return state;
      }

      const previousSnapshot = state.history.past[state.history.past.length - 1];
      if (!previousSnapshot) {
        return state;
      }

      return restoreSnapshot(state, previousSnapshot, {
        past: state.history.past.slice(0, -1),
        future: trimHistory([
          ...state.history.future,
          createPoseEditorSnapshot(state)
        ]),
        dragSnapshot: null
      });
    }
    case 'redo': {
      if (state.interaction) {
        return state;
      }

      const nextSnapshot = state.history.future[state.history.future.length - 1];
      if (!nextSnapshot) {
        return state;
      }

      return restoreSnapshot(state, nextSnapshot, {
        past: trimHistory([
          ...state.history.past,
          createPoseEditorSnapshot(state)
        ]),
        future: state.history.future.slice(0, -1),
        dragSnapshot: null
      });
    }
    default:
      return state;
  }
};
