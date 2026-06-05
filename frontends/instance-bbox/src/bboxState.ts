import type { ImageRect } from '@anno-lab/shared';

import { DEFAULT_OBJECT_LABEL } from './constants';
import type { BboxDefinition, Box } from './types';

const HISTORY_LIMIT = 50;

export interface BboxEditorSnapshot {
  boxes: Box[];
  selectedBoxId: string | null;
}

export interface BboxEditorHistoryState {
  past: BboxEditorSnapshot[];
  future: BboxEditorSnapshot[];
  dragSnapshot: BboxEditorSnapshot | null;
}

export interface BboxEditorHistoryTransition {
  history: BboxEditorHistoryState;
  snapshot: BboxEditorSnapshot;
}

export const createBoxId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `instance-bbox-${crypto.randomUUID()}`;
  }
  return `instance-bbox-${Date.now()}`;
};

export const resolveLabels = (definition: BboxDefinition): string[] => {
  const rawLabels: unknown[] = Array.isArray(definition.object_classes)
    ? definition.object_classes
    : [];

  return rawLabels.length > 0
    ? rawLabels.filter((label): label is string => typeof label === 'string')
    : [DEFAULT_OBJECT_LABEL];
};

const trimHistory = (
  snapshots: BboxEditorSnapshot[]
): BboxEditorSnapshot[] =>
  snapshots.length > HISTORY_LIMIT
    ? snapshots.slice(snapshots.length - HISTORY_LIMIT)
    : snapshots;

const areRectsEqual = (left: ImageRect, right: ImageRect): boolean =>
  left.x === right.x &&
  left.y === right.y &&
  left.width === right.width &&
  left.height === right.height;

const areBoxesEqual = (left: Box[], right: Box[]): boolean =>
  left.length === right.length &&
  left.every((box, index) => {
    const candidate = right[index];
    if (!candidate) {
      return false;
    }

    return (
      box.id === candidate.id &&
      box.label === candidate.label &&
      areRectsEqual(box.rect, candidate.rect)
    );
  });

export const createBboxEditorHistoryState = (): BboxEditorHistoryState => ({
  past: [],
  future: [],
  dragSnapshot: null
});

export const createBboxEditorSnapshot = ({
  boxes,
  selectedBoxId
}: BboxEditorSnapshot): BboxEditorSnapshot => ({
  boxes,
  selectedBoxId
});

export const areBboxEditorSnapshotsEqual = (
  left: BboxEditorSnapshot,
  right: BboxEditorSnapshot
): boolean =>
  left.selectedBoxId === right.selectedBoxId && areBoxesEqual(left.boxes, right.boxes);

export const canUndoBboxEditorChange = (history: BboxEditorHistoryState): boolean =>
  history.past.length > 0;

export const canRedoBboxEditorChange = (history: BboxEditorHistoryState): boolean =>
  history.future.length > 0;

export const applyCommittedBboxSnapshot = (
  history: BboxEditorHistoryState,
  currentSnapshot: BboxEditorSnapshot,
  nextSnapshot: BboxEditorSnapshot
): BboxEditorHistoryState => {
  if (areBboxEditorSnapshotsEqual(currentSnapshot, nextSnapshot)) {
    return history;
  }

  return {
    past: trimHistory([...history.past, currentSnapshot]),
    future: [],
    dragSnapshot: null
  };
};

export const startBboxDragHistory = (
  history: BboxEditorHistoryState,
  currentSnapshot: BboxEditorSnapshot
): BboxEditorHistoryState =>
  history.dragSnapshot
    ? history
    : {
        ...history,
        dragSnapshot: currentSnapshot
      };

export const finishBboxDragHistory = (
  history: BboxEditorHistoryState,
  currentSnapshot: BboxEditorSnapshot
): BboxEditorHistoryState => {
  if (!history.dragSnapshot) {
    return history;
  }

  if (areBboxEditorSnapshotsEqual(history.dragSnapshot, currentSnapshot)) {
    return {
      ...history,
      dragSnapshot: null
    };
  }

  return {
    past: trimHistory([...history.past, history.dragSnapshot]),
    future: [],
    dragSnapshot: null
  };
};

export const cancelBboxDragHistory = (
  history: BboxEditorHistoryState
): { history: BboxEditorHistoryState; snapshot: BboxEditorSnapshot | null } => ({
  history: {
    past: history.past,
    future: history.future,
    dragSnapshot: null
  },
  snapshot: history.dragSnapshot
});

export const undoBboxEditorChange = (
  history: BboxEditorHistoryState,
  currentSnapshot: BboxEditorSnapshot
): BboxEditorHistoryTransition | null => {
  if (!history.past.length) {
    return null;
  }

  const previousSnapshot = history.past[history.past.length - 1];
  return {
    snapshot: previousSnapshot,
    history: {
      past: history.past.slice(0, -1),
      future: trimHistory([...history.future, currentSnapshot]),
      dragSnapshot: null
    }
  };
};

export const redoBboxEditorChange = (
  history: BboxEditorHistoryState,
  currentSnapshot: BboxEditorSnapshot
): BboxEditorHistoryTransition | null => {
  if (!history.future.length) {
    return null;
  }

  const nextSnapshot = history.future[history.future.length - 1];
  return {
    snapshot: nextSnapshot,
    history: {
      past: trimHistory([...history.past, currentSnapshot]),
      future: history.future.slice(0, -1),
      dragSnapshot: null
    }
  };
};

export const createBox = (rect: ImageRect, label: string): Box => ({
  id: createBoxId(),
  label,
  rect
});

export const replaceBoxRect = (boxes: Box[], boxId: string, rect: ImageRect): Box[] =>
  boxes.map((box) => (box.id === boxId ? { ...box, rect } : box));

export const replaceBoxLabel = (boxes: Box[], boxId: string, label: string): Box[] =>
  boxes.map((box) => (box.id === boxId ? { ...box, label } : box));

export const removeBox = (boxes: Box[], boxId: string): Box[] =>
  boxes.filter((box) => box.id !== boxId);
