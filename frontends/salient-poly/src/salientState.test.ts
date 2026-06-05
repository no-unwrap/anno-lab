import { describe, expect, it } from 'vitest';

import {
  canCloseDraftPolygon,
  canRedoEditorChange,
  canUndoEditorChange,
  createSalientEditorState,
  salientEditorReducer
} from './salientState';

describe('salientState', () => {
  it('promotes a completed draft into a selected closed polygon with local undo/redo history', () => {
    let state = createSalientEditorState();
    state = salientEditorReducer(state, {
      type: 'append_draft_point',
      point: { x: 10, y: 20 }
    });
    state = salientEditorReducer(state, {
      type: 'append_draft_point',
      point: { x: 30, y: 40 }
    });
    state = salientEditorReducer(state, {
      type: 'append_draft_point',
      point: { x: 50, y: 60 }
    });

    expect(canCloseDraftPolygon(state, 3)).toBe(true);

    const closedState = salientEditorReducer(state, {
      type: 'close_draft',
      polygonId: 'poly-1',
      label: 'salient_object'
    });
    const undoneState = salientEditorReducer(closedState, {
      type: 'undo'
    });
    const redoneState = salientEditorReducer(undoneState, {
      type: 'redo'
    });

    expect(closedState.draftPoints).toEqual([]);
    expect(closedState.selectedPolygonId).toBe('poly-1');
    expect(closedState.polygons).toEqual([
      {
        id: 'poly-1',
        label: 'salient_object',
        points: [
          { x: 10, y: 20 },
          { x: 30, y: 40 },
          { x: 50, y: 60 }
        ]
      }
    ]);
    expect(canUndoEditorChange(closedState)).toBe(true);
    expect(undoneState.draftPoints).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 50, y: 60 }
    ]);
    expect(undoneState.polygons).toEqual([]);
    expect(canRedoEditorChange(undoneState)).toBe(true);
    expect(redoneState.polygons[0]?.id).toBe('poly-1');
    expect(redoneState.selectedPolygonId).toBe('poly-1');
  });

  it('commits one undoable history step when a vertex drag changes geometry', () => {
    let state = createSalientEditorState();
    state = salientEditorReducer(state, {
      type: 'append_draft_point',
      point: { x: 10, y: 20 }
    });
    state = salientEditorReducer(state, {
      type: 'append_draft_point',
      point: { x: 30, y: 40 }
    });
    state = salientEditorReducer(state, {
      type: 'append_draft_point',
      point: { x: 50, y: 60 }
    });
    const closedState = salientEditorReducer(state, {
      type: 'close_draft',
      polygonId: 'poly-1',
      label: 'salient_object'
    });

    const draggingState = salientEditorReducer(closedState, {
      type: 'start_dragging_vertex',
      drag: {
        polygonId: 'poly-1',
        polygonIndex: 0,
        vertexIndex: 2
      }
    });
    const updatedState = salientEditorReducer(draggingState, {
      type: 'update_dragging_vertex',
      point: { x: 58, y: 72 }
    });
    const finishedState = salientEditorReducer(updatedState, {
      type: 'clear_interaction'
    });
    const undoneState = salientEditorReducer(finishedState, {
      type: 'undo'
    });
    const redoneState = salientEditorReducer(undoneState, {
      type: 'redo'
    });

    expect(draggingState.selectedPolygonId).toBe('poly-1');
    expect(updatedState.polygons[0]?.points[2]).toEqual({ x: 58, y: 72 });
    expect(updatedState.interaction).toEqual({
      polygonId: 'poly-1',
      polygonIndex: 0,
      vertexIndex: 2
    });
    expect(finishedState.interaction).toBeNull();
    expect(canUndoEditorChange(finishedState)).toBe(true);
    expect(undoneState.polygons[0]?.points[2]).toEqual({ x: 50, y: 60 });
    expect(undoneState.selectedPolygonId).toBe('poly-1');
    expect(redoneState.polygons[0]?.points[2]).toEqual({ x: 58, y: 72 });
  });

  it('does not create a history entry for a drag that ends without moving a vertex', () => {
    let state = createSalientEditorState();
    state = salientEditorReducer(state, {
      type: 'append_draft_point',
      point: { x: 10, y: 20 }
    });
    state = salientEditorReducer(state, {
      type: 'append_draft_point',
      point: { x: 30, y: 40 }
    });
    state = salientEditorReducer(state, {
      type: 'append_draft_point',
      point: { x: 50, y: 60 }
    });
    state = salientEditorReducer(state, {
      type: 'close_draft',
      polygonId: 'poly-1',
      label: 'salient_object'
    });
    state = salientEditorReducer(state, {
      type: 'undo'
    });
    state = salientEditorReducer(state, {
      type: 'redo'
    });
    state = salientEditorReducer(state, {
      type: 'start_dragging_vertex',
      drag: {
        polygonId: 'poly-1',
        polygonIndex: 0,
        vertexIndex: 1
      }
    });
    const finishedState = salientEditorReducer(state, {
      type: 'clear_interaction'
    });
    const undoneState = salientEditorReducer(finishedState, {
      type: 'undo'
    });

    expect(canUndoEditorChange(finishedState)).toBe(true);
    expect(canRedoEditorChange(finishedState)).toBe(false);
    expect(finishedState.polygons[0]?.points[1]).toEqual({ x: 30, y: 40 });
    expect(undoneState.polygons).toEqual([]);
    expect(undoneState.draftPoints).toHaveLength(3);
  });

  it('restores the pre-drag polygon without adding history when a drag is canceled', () => {
    let state = createSalientEditorState();
    state = salientEditorReducer(state, {
      type: 'append_draft_point',
      point: { x: 10, y: 20 }
    });
    state = salientEditorReducer(state, {
      type: 'append_draft_point',
      point: { x: 30, y: 40 }
    });
    state = salientEditorReducer(state, {
      type: 'append_draft_point',
      point: { x: 50, y: 60 }
    });
    const closedState = salientEditorReducer(state, {
      type: 'close_draft',
      polygonId: 'poly-1',
      label: 'salient_object'
    });

    const draggingState = salientEditorReducer(closedState, {
      type: 'start_dragging_vertex',
      drag: {
        polygonId: 'poly-1',
        polygonIndex: 0,
        vertexIndex: 0
      }
    });
    const updatedState = salientEditorReducer(draggingState, {
      type: 'update_dragging_vertex',
      point: { x: 14, y: 28 }
    });
    const canceledState = salientEditorReducer(updatedState, {
      type: 'cancel_interaction'
    });
    const undoneState = salientEditorReducer(canceledState, {
      type: 'undo'
    });
    const redoneState = salientEditorReducer(undoneState, {
      type: 'redo'
    });

    expect(updatedState.polygons[0]?.points[0]).toEqual({ x: 14, y: 28 });
    expect(canceledState.interaction).toBeNull();
    expect(canceledState.polygons[0]?.points[0]).toEqual({ x: 10, y: 20 });
    expect(canUndoEditorChange(canceledState)).toBe(true);
    expect(undoneState.polygons).toEqual([]);
    expect(undoneState.draftPoints).toHaveLength(3);
    expect(redoneState.polygons[0]?.points[0]).toEqual({ x: 10, y: 20 });
    expect(canRedoEditorChange(canceledState)).toBe(false);
  });

  it('reorders selected polygons with one undoable history step', () => {
    let state = createSalientEditorState();
    state = salientEditorReducer(state, {
      type: 'append_draft_point',
      point: { x: 10, y: 20 }
    });
    state = salientEditorReducer(state, {
      type: 'append_draft_point',
      point: { x: 30, y: 40 }
    });
    state = salientEditorReducer(state, {
      type: 'append_draft_point',
      point: { x: 50, y: 60 }
    });
    state = salientEditorReducer(state, {
      type: 'close_draft',
      polygonId: 'poly-1',
      label: 'salient_object'
    });
    state = salientEditorReducer(state, {
      type: 'append_draft_point',
      point: { x: 110, y: 120 }
    });
    state = salientEditorReducer(state, {
      type: 'append_draft_point',
      point: { x: 130, y: 140 }
    });
    state = salientEditorReducer(state, {
      type: 'append_draft_point',
      point: { x: 150, y: 160 }
    });
    state = salientEditorReducer(state, {
      type: 'close_draft',
      polygonId: 'poly-2',
      label: 'salient_object'
    });

    const reorderedState = salientEditorReducer(state, {
      type: 'move_polygon',
      polygonId: 'poly-2',
      targetIndex: 0
    });
    const undoneState = salientEditorReducer(reorderedState, {
      type: 'undo'
    });
    const redoneState = salientEditorReducer(undoneState, {
      type: 'redo'
    });

    expect(reorderedState.polygons.map((polygon) => polygon.id)).toEqual([
      'poly-2',
      'poly-1'
    ]);
    expect(reorderedState.selectedPolygonId).toBe('poly-2');
    expect(canUndoEditorChange(reorderedState)).toBe(true);
    expect(undoneState.polygons.map((polygon) => polygon.id)).toEqual([
      'poly-1',
      'poly-2'
    ]);
    expect(canRedoEditorChange(undoneState)).toBe(true);
    expect(redoneState.polygons.map((polygon) => polygon.id)).toEqual([
      'poly-2',
      'poly-1'
    ]);
  });

  it('inserts a vertex as one undoable history step', () => {
    let state = createSalientEditorState();
    state = salientEditorReducer(state, {
      type: 'append_draft_point',
      point: { x: 10, y: 20 }
    });
    state = salientEditorReducer(state, {
      type: 'append_draft_point',
      point: { x: 30, y: 40 }
    });
    state = salientEditorReducer(state, {
      type: 'append_draft_point',
      point: { x: 50, y: 60 }
    });
    state = salientEditorReducer(state, {
      type: 'close_draft',
      polygonId: 'poly-1',
      label: 'salient_object'
    });

    const insertedState = salientEditorReducer(state, {
      type: 'insert_polygon_vertex',
      polygonId: 'poly-1',
      afterVertexIndex: 0,
      point: { x: 20, y: 30 }
    });
    const undoneState = salientEditorReducer(insertedState, {
      type: 'undo'
    });
    const redoneState = salientEditorReducer(undoneState, {
      type: 'redo'
    });

    expect(insertedState.polygons[0]?.points).toEqual([
      { x: 10, y: 20 },
      { x: 20, y: 30 },
      { x: 30, y: 40 },
      { x: 50, y: 60 }
    ]);
    expect(insertedState.selectedPolygonId).toBe('poly-1');
    expect(undoneState.polygons[0]?.points).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 50, y: 60 }
    ]);
    expect(redoneState.polygons[0]?.points[1]).toEqual({ x: 20, y: 30 });
  });

  it('removes a vertex as one undoable history step while enforcing the minimum point count', () => {
    let state = createSalientEditorState();
    state = salientEditorReducer(state, {
      type: 'append_draft_point',
      point: { x: 10, y: 20 }
    });
    state = salientEditorReducer(state, {
      type: 'append_draft_point',
      point: { x: 30, y: 40 }
    });
    state = salientEditorReducer(state, {
      type: 'append_draft_point',
      point: { x: 50, y: 60 }
    });
    state = salientEditorReducer(state, {
      type: 'append_draft_point',
      point: { x: 70, y: 80 }
    });
    state = salientEditorReducer(state, {
      type: 'close_draft',
      polygonId: 'poly-1',
      label: 'salient_object'
    });

    const removedState = salientEditorReducer(state, {
      type: 'remove_polygon_vertex',
      polygonId: 'poly-1',
      vertexIndex: 1,
      minimumPoints: 3
    });
    const blockedState = salientEditorReducer(removedState, {
      type: 'remove_polygon_vertex',
      polygonId: 'poly-1',
      vertexIndex: 0,
      minimumPoints: 3
    });
    const undoneState = salientEditorReducer(removedState, {
      type: 'undo'
    });

    expect(removedState.polygons[0]?.points).toEqual([
      { x: 10, y: 20 },
      { x: 50, y: 60 },
      { x: 70, y: 80 }
    ]);
    expect(blockedState).toEqual(removedState);
    expect(undoneState.polygons[0]?.points).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 50, y: 60 },
      { x: 70, y: 80 }
    ]);
  });
});
