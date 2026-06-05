import type { FeedbackState, ShortcutHint } from '@anno-lab/shared';

export const RESULT_SCHEMA_VERSION = '2.0.0';
export const TOOL_VERSION = 'salient-poly@0.2.7';
export const SALIENT_OBJECT_LABEL = 'salient_object';
export const DRAFT_CLOSE_RADIUS = 12;
export const TEST_JPG_URL =
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=80';

export const SHORTCUTS: ShortcutHint[] = [
  { keyLabel: 'M', description: 'Toggle precision magnifier' },
  { keyLabel: 'Ctrl/Cmd+Z', description: 'Undo polygon edit' },
  { keyLabel: 'Ctrl/Cmd+Shift+Z', description: 'Redo polygon edit' },
  { keyLabel: 'Ctrl/Cmd+Y', description: 'Redo polygon edit (alternative)' },
  { keyLabel: 'Enter', description: 'Close current polygon' },
  { keyLabel: 'Backspace', description: 'Undo draft vertex' },
  { keyLabel: 'Delete', description: 'Delete selected polygon' },
  { keyLabel: 'R', description: 'Reset draft polygon' },
  {
    keyLabel: 'Esc',
    description: 'Cancel drag or removal mode, clear selection, or clear draft'
  }
];

export const DEFAULT_FEEDBACK: FeedbackState = {
  tone: 'neutral',
  label: 'Editor',
  message:
    'Place vertices around each salient object, closing each polygon before starting the next.'
};
