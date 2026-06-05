import type { FeedbackState, ShortcutHint } from '@anno-lab/shared';

import type { LandmarkDefinition, SkeletonEdge } from './types';

export const RESULT_SCHEMA_VERSION = '1.0.0';
export const TOOL_VERSION = 'pose-keypoints@0.1.5';
export const DEFAULT_SUBJECT_LABEL = 'Primary person';
export const DEFAULT_INSTRUCTION_TEXT =
  'Annotate one primary person with ordered body keypoints.';

export const SHORTCUTS: ShortcutHint[] = [
  { keyLabel: 'K', description: 'Place mode' },
  { keyLabel: 'S', description: 'Select mode' },
  { keyLabel: 'M', description: 'Toggle precision magnifier' },
  { keyLabel: '[ / ]', description: 'Previous or next landmark' },
  { keyLabel: 'V / O / N', description: 'Visible, occluded, or not in frame' },
  { keyLabel: 'Ctrl/Cmd+Z / Y', description: 'Undo or redo keypoint edits' },
  { keyLabel: 'Delete', description: 'Clear selected landmark' }
];

export const TEST_JPG_URL =
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=1600&q=80';

export const DEFAULT_FEEDBACK: FeedbackState = {
  tone: 'neutral',
  label: 'Editor',
  message:
    'Annotate one primary person with the ordered landmark list, keeping visibility state explicit for each keypoint.'
};

export const FALLBACK_LANDMARKS: LandmarkDefinition[] = [
  { id: 'nose', label: 'Nose', color: '#f28f16' },
  { id: 'left_shoulder', label: 'Left shoulder', color: '#116466' },
  { id: 'right_shoulder', label: 'Right shoulder', color: '#3a7d44' },
  { id: 'left_hip', label: 'Left hip', color: '#b56576' },
  { id: 'right_hip', label: 'Right hip', color: '#6d597a' }
];

export const FALLBACK_SKELETON: SkeletonEdge[] = [
  { from: 'nose', to: 'left_shoulder' },
  { from: 'nose', to: 'right_shoulder' },
  { from: 'left_shoulder', to: 'left_hip' },
  { from: 'right_shoulder', to: 'right_hip' },
  { from: 'left_shoulder', to: 'right_shoulder' },
  { from: 'left_hip', to: 'right_hip' }
];
