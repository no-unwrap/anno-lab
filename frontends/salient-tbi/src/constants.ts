import type { FeedbackState, ShortcutHint } from '@anno-lab/shared';

export const RESULT_SCHEMA_VERSION = '1.0.0';
export const TOOL_VERSION = 'salient-tbi@0.1.0';
export const TEST_JPG_URL =
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=80';
export const MAX_SIGNAL_PROMPTS = 3;

export const SHORTCUTS: ShortcutHint[] = [
  { keyLabel: 'M', description: 'Toggle precision magnifier' },
  { keyLabel: 'Enter', description: 'Advance to the next step or submit' },
  { keyLabel: 'Esc', description: 'Return to signal marking from the report step' },
  { keyLabel: 'D', description: 'Mark the scene as diffuse' }
];

export const DEFAULT_FEEDBACK: FeedbackState = {
  tone: 'neutral',
  label: 'Signal step',
  message: 'Mark the one thing that draws your attention first, then answer the scene questions.'
};

export const DEFAULT_INSTRUCTION_TEXT = 'Mark the one thing that draws your attention first.';
export const DEFAULT_OVERWHELM_QUESTION = 'How visually overwhelming is this scene for you?';
export const DEFAULT_DIFFICULTY_QUESTION = 'How hard was it to find the signal?';
export const DIFFICULTY_OPTIONS = ['easy', 'moderate', 'hard'] as const;
export const OVERWHELM_OPTIONS = [1, 2, 3, 4, 5] as const;
