import type { FeedbackState, ShortcutHint } from '@anno-lab/shared';

export const RESULT_SCHEMA_VERSION = '1.0.0';
export const TOOL_VERSION = 'instance-bbox@0.1.5';
export const DEFAULT_OBJECT_LABEL = 'object';

export const SHORTCUTS: ShortcutHint[] = [
  { keyLabel: 'D', description: 'Draw mode' },
  { keyLabel: 'V', description: 'Select mode' },
  { keyLabel: 'M', description: 'Toggle precision magnifier' },
  { keyLabel: 'Ctrl/Cmd+Z / Y', description: 'Undo or redo box edits' },
  { keyLabel: 'Delete', description: 'Delete box' },
  { keyLabel: 'Esc', description: 'Cancel current interaction or clear selection' }
];

export const TEST_JPG_URL =
  'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1600&q=80';

export const DEFAULT_FEEDBACK: FeedbackState = {
  tone: 'neutral',
  label: 'Editor',
  message:
    'Drag inside the image to create a bounding box for each visible object instance, then refine labels from the object rail.'
};
