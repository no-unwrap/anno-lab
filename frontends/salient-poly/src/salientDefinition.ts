import type { SalientDefinition } from './types';

export const resolveMinPoints = (definition: SalientDefinition): number =>
  typeof definition.min_points === 'number' ? Math.max(3, definition.min_points) : 3;

export const resolveInstructionText = (definition: SalientDefinition): string =>
  typeof definition.instructions === 'string' && definition.instructions.trim()
    ? definition.instructions.trim()
    : 'Trace each salient object with its own polygon in natural image pixels.';
