import { describe, expect, it } from 'vitest';

import {
  canRedoPoseEditorChange,
  canUndoPoseEditorChange,
  createPoseEditorState,
  getKeypointById,
  poseEditorReducer
} from './poseState';
import type { LandmarkDefinition } from './types';

const LANDMARKS: LandmarkDefinition[] = [
  { id: 'nose', label: 'Nose', color: '#f28f16' },
  { id: 'left_shoulder', label: 'Left shoulder', color: '#116466' },
  { id: 'right_shoulder', label: 'Right shoulder', color: '#3a7d44' }
];

describe('poseState', () => {
  it('initializes the editor state with the first landmark selected in place mode', () => {
    expect(createPoseEditorState(LANDMARKS)).toEqual({
      keypoints: [
        {
          landmarkId: 'nose',
          label: 'Nose',
          color: '#f28f16',
          state: 'pending',
          point: null
        },
        {
          landmarkId: 'left_shoulder',
          label: 'Left shoulder',
          color: '#116466',
          state: 'pending',
          point: null
        },
        {
          landmarkId: 'right_shoulder',
          label: 'Right shoulder',
          color: '#3a7d44',
          state: 'pending',
          point: null
        }
      ],
      mode: 'place',
      selectedLandmarkId: 'nose',
      interaction: null,
      history: {
        past: [],
        future: [],
        dragSnapshot: null
      }
    });
  });

  it('places landmarks through the reducer and auto-advances to the next pending landmark', () => {
    const initialState = createPoseEditorState(LANDMARKS);

    const nextState = poseEditorReducer(initialState, {
      type: 'place_landmark',
      landmarkId: 'nose',
      point: { x: 120, y: 180 }
    });

    expect(getKeypointById(nextState.keypoints, 'nose')).toMatchObject({
      state: 'visible',
      point: { x: 120, y: 180 }
    });
    expect(nextState.selectedLandmarkId).toBe('left_shoulder');
  });

  it('marks the selected landmark as not in frame and advances selection to the next pending landmark', () => {
    let state = createPoseEditorState(LANDMARKS);
    state = poseEditorReducer(state, {
      type: 'place_landmark',
      landmarkId: 'nose',
      point: { x: 100, y: 100 },
      autoAdvance: false
    });
    state = poseEditorReducer(state, {
      type: 'select',
      landmarkId: 'left_shoulder'
    });

    const nextState = poseEditorReducer(state, {
      type: 'set_selected_state',
      state: 'not_in_frame'
    });

    expect(getKeypointById(nextState.keypoints, 'left_shoulder')).toMatchObject({
      state: 'not_in_frame',
      point: null
    });
    expect(nextState.selectedLandmarkId).toBe('right_shoulder');
  });

  it('tracks drag transitions in reducer state while preserving occluded visibility', () => {
    const initialState = createPoseEditorState(LANDMARKS);

    const draggingState = poseEditorReducer(initialState, {
      type: 'start_dragging',
      landmarkId: 'nose',
      point: { x: 40, y: 50 },
      state: 'occluded'
    });
    const movedState = poseEditorReducer(draggingState, {
      type: 'update_dragging',
      point: { x: 90, y: 110 }
    });

    expect(draggingState.interaction).toEqual({
      type: 'dragging',
      landmarkId: 'nose',
      state: 'occluded'
    });
    expect(getKeypointById(movedState.keypoints, 'nose')).toMatchObject({
      state: 'occluded',
      point: { x: 90, y: 110 }
    });
  });

  it('undoes and redoes committed landmark edits without changing the result contract', () => {
    const initialState = createPoseEditorState(LANDMARKS);

    const placedState = poseEditorReducer(initialState, {
      type: 'place_landmark',
      landmarkId: 'nose',
      point: { x: 120, y: 180 }
    });
    const undoneState = poseEditorReducer(placedState, {
      type: 'undo'
    });
    const redoneState = poseEditorReducer(undoneState, {
      type: 'redo'
    });

    expect(canUndoPoseEditorChange(placedState)).toBe(true);
    expect(getKeypointById(undoneState.keypoints, 'nose')).toMatchObject({
      state: 'pending',
      point: null
    });
    expect(undoneState.selectedLandmarkId).toBe('nose');
    expect(canRedoPoseEditorChange(undoneState)).toBe(true);
    expect(getKeypointById(redoneState.keypoints, 'nose')).toMatchObject({
      state: 'visible',
      point: { x: 120, y: 180 }
    });
    expect(redoneState.selectedLandmarkId).toBe('left_shoulder');
  });

  it('treats keypoint dragging as one undoable edit and restores the pre-drag snapshot on cancel', () => {
    let state = createPoseEditorState(LANDMARKS);
    state = poseEditorReducer(state, {
      type: 'place_landmark',
      landmarkId: 'nose',
      point: { x: 40, y: 50 },
      autoAdvance: false
    });

    const draggingState = poseEditorReducer(state, {
      type: 'start_dragging',
      landmarkId: 'nose',
      point: { x: 40, y: 50 },
      state: 'visible'
    });
    const movedState = poseEditorReducer(draggingState, {
      type: 'update_dragging',
      point: { x: 90, y: 110 }
    });
    const committedState = poseEditorReducer(movedState, {
      type: 'clear_interaction'
    });
    const undoneState = poseEditorReducer(committedState, {
      type: 'undo'
    });

    expect(getKeypointById(committedState.keypoints, 'nose')).toMatchObject({
      point: { x: 90, y: 110 }
    });
    expect(getKeypointById(undoneState.keypoints, 'nose')).toMatchObject({
      point: { x: 40, y: 50 }
    });

    const canceledState = poseEditorReducer(
      poseEditorReducer(draggingState, {
        type: 'update_dragging',
        point: { x: 120, y: 130 }
      }),
      {
        type: 'cancel_interaction'
      }
    );

    expect(canceledState.interaction).toBeNull();
    expect(getKeypointById(canceledState.keypoints, 'nose')).toMatchObject({
      point: { x: 40, y: 50 }
    });
  });
});
