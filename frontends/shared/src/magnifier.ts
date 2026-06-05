export const MAGNIFIER_LEVELS = [1.5, 3, 5] as const;

export type MagnifierLevel = (typeof MAGNIFIER_LEVELS)[number];

export const DEFAULT_MAGNIFIER_LEVEL: MagnifierLevel = 3;

export const formatMagnificationLabel = (value: number): string =>
  `${Number(value.toFixed(value % 1 === 0 ? 0 : 1))}x`;
