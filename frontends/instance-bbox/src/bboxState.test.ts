import { describe, expect, it } from 'vitest';

import {
  applyCommittedBboxSnapshot,
  canRedoBboxEditorChange,
  canUndoBboxEditorChange,
  cancelBboxDragHistory,
  createBboxEditorHistoryState,
  createBboxEditorSnapshot,
  finishBboxDragHistory,
  redoBboxEditorChange,
  startBboxDragHistory,
  undoBboxEditorChange
} from './bboxState';
import type { Box } from './types';

const FIRST_BOX: Box = {
  id: 'instance-bbox-box-1',
  label: 'person',
  rect: { x: 20, y: 30, width: 120, height: 90 }
};

describe('bboxState', () => {
  it('undoes and redoes committed box edits while preserving the selected box', () => {
    const initialSnapshot = createBboxEditorSnapshot({
      boxes: [],
      selectedBoxId: null
    });
    const placedSnapshot = createBboxEditorSnapshot({
      boxes: [FIRST_BOX],
      selectedBoxId: FIRST_BOX.id
    });

    const history = applyCommittedBboxSnapshot(
      createBboxEditorHistoryState(),
      initialSnapshot,
      placedSnapshot
    );
    const undoneTransition = undoBboxEditorChange(history, placedSnapshot);
    const redoneTransition = undoneTransition
      ? redoBboxEditorChange(undoneTransition.history, undoneTransition.snapshot)
      : null;

    expect(canUndoBboxEditorChange(history)).toBe(true);
    expect(undoneTransition?.snapshot).toEqual(initialSnapshot);
    expect(undoneTransition && canRedoBboxEditorChange(undoneTransition.history)).toBe(true);
    expect(redoneTransition?.snapshot).toEqual(placedSnapshot);
  });

  it('treats a box drag as one undoable edit and restores the pre-drag snapshot on cancel', () => {
    const placedSnapshot = createBboxEditorSnapshot({
      boxes: [FIRST_BOX],
      selectedBoxId: FIRST_BOX.id
    });
    const movedSnapshot = createBboxEditorSnapshot({
      boxes: [
        {
          ...FIRST_BOX,
          rect: { x: 48, y: 64, width: 120, height: 90 }
        }
      ],
      selectedBoxId: FIRST_BOX.id
    });

    const dragHistory = startBboxDragHistory(createBboxEditorHistoryState(), placedSnapshot);
    const committedHistory = finishBboxDragHistory(dragHistory, movedSnapshot);
    const undoneTransition = undoBboxEditorChange(committedHistory, movedSnapshot);

    expect(canUndoBboxEditorChange(committedHistory)).toBe(true);
    expect(undoneTransition?.snapshot).toEqual(placedSnapshot);

    const canceledDrag = cancelBboxDragHistory(
      startBboxDragHistory(createBboxEditorHistoryState(), placedSnapshot)
    );

    expect(canceledDrag.snapshot).toEqual(placedSnapshot);
    expect(canUndoBboxEditorChange(canceledDrag.history)).toBe(false);
    expect(canRedoBboxEditorChange(canceledDrag.history)).toBe(false);
  });
});
