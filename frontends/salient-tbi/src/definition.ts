import {
  DEFAULT_DIFFICULTY_QUESTION,
  DEFAULT_INSTRUCTION_TEXT,
  DEFAULT_OVERWHELM_QUESTION
} from './constants';

export interface SalientTbiDefinition {
  instruction_text?: string;
  overwhelm_question?: string;
  search_difficulty_question?: string;
  allow_manual_fallback?: boolean;
}

const resolveTrimmedString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

export const resolveInstructionText = (definition: SalientTbiDefinition): string =>
  resolveTrimmedString(definition.instruction_text) ?? DEFAULT_INSTRUCTION_TEXT;

export const resolveOverwhelmQuestion = (definition: SalientTbiDefinition): string =>
  resolveTrimmedString(definition.overwhelm_question) ?? DEFAULT_OVERWHELM_QUESTION;

export const resolveSearchDifficultyQuestion = (definition: SalientTbiDefinition): string =>
  resolveTrimmedString(definition.search_difficulty_question) ?? DEFAULT_DIFFICULTY_QUESTION;
