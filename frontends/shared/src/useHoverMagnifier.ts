import { RefObject, useCallback, useEffect, useState } from 'react';

import { formatMagnificationLabel } from './magnifier';
import type { DisplayPoint, ImageMetrics } from './types';

const DEFAULT_LENS_SIZE = 176;
const DEFAULT_LENS_MAGNIFICATION = 3;
const CURSOR_OFFSET = 20;
const EDGE_PADDING = 12;

interface ClientPointLike {
  clientX: number;
  clientY: number;
}

export interface HoverMagnifierState {
  x: number;
  y: number;
  backgroundImage: string;
  backgroundSize: string;
  backgroundPosition: string;
  magnificationLabel: string;
}

export interface HoverCrosshairState {
  x: number;
  y: number;
}

interface UseHoverMagnifierOptions {
  active: boolean;
  displayScale?: number;
  imageUrl?: string | null;
  lensMagnification?: number;
  lensSize?: number;
  metrics: ImageMetrics | null;
  resolveDisplayPoint: (stagePoint: DisplayPoint, metrics: ImageMetrics) => DisplayPoint | null;
  stageRef: RefObject<HTMLElement | null>;
  suspended?: boolean;
}

const roundMagnifierValue = (value: number): number => Number(value.toFixed(2));

type LensAxisPreference = 'before' | 'after';

const isWithinStage = (position: number, maxPosition: number): boolean =>
  position >= EDGE_PADDING && position <= maxPosition;

const clampLensPosition = (position: number, maxPosition: number): number =>
  Math.min(Math.max(position, EDGE_PADDING), maxPosition);

const resolveLensAxis = (
  cursor: number,
  stageSize: number,
  lensSize: number,
  preference: LensAxisPreference
): number => {
  const maxPosition = Math.max(EDGE_PADDING, stageSize - lensSize - EDGE_PADDING);
  const beforePosition = cursor - lensSize - CURSOR_OFFSET;
  const afterPosition = cursor + CURSOR_OFFSET;
  const preferredPosition = preference === 'before' ? beforePosition : afterPosition;
  const fallbackPosition = preference === 'before' ? afterPosition : beforePosition;

  if (isWithinStage(preferredPosition, maxPosition)) {
    return roundMagnifierValue(preferredPosition);
  }

  if (isWithinStage(fallbackPosition, maxPosition)) {
    return roundMagnifierValue(fallbackPosition);
  }

  return roundMagnifierValue(clampLensPosition(fallbackPosition, maxPosition));
};

export const useHoverMagnifier = ({
  active,
  displayScale = 1,
  imageUrl,
  lensMagnification = DEFAULT_LENS_MAGNIFICATION,
  lensSize = DEFAULT_LENS_SIZE,
  metrics,
  resolveDisplayPoint,
  stageRef,
  suspended = false
}: UseHoverMagnifierOptions) => {
  const [crosshair, setCrosshair] = useState<HoverCrosshairState | null>(null);
  const [lens, setLens] = useState<HoverMagnifierState | null>(null);

  const clear = useCallback(() => {
    setCrosshair(null);
    setLens(null);
  }, []);

  const updateFromClientPoint = useCallback(
    ({ clientX, clientY }: ClientPointLike) => {
      if (!active || suspended || !imageUrl || !metrics || !stageRef.current) {
        setCrosshair(null);
        setLens(null);
        return;
      }

      const stageRect = stageRef.current.getBoundingClientRect();
      const stagePoint = {
        x: clientX - stageRect.left,
        y: clientY - stageRect.top
      };
      const resolvedDisplayPoint = resolveDisplayPoint(stagePoint, metrics);
      if (!resolvedDisplayPoint) {
        setCrosshair(null);
        setLens(null);
        return;
      }

      const backgroundWidth = roundMagnifierValue(
        metrics.renderedWidth * displayScale * lensMagnification
      );
      const backgroundHeight = roundMagnifierValue(
        metrics.renderedHeight * displayScale * lensMagnification
      );
      const backgroundPositionX = roundMagnifierValue(
        lensSize / 2 - resolvedDisplayPoint.x * displayScale * lensMagnification
      );
      const backgroundPositionY = roundMagnifierValue(
        lensSize / 2 - resolvedDisplayPoint.y * displayScale * lensMagnification
      );

      setCrosshair({
        x: roundMagnifierValue(resolvedDisplayPoint.x),
        y: roundMagnifierValue(resolvedDisplayPoint.y)
      });
      setLens({
        x: resolveLensAxis(stagePoint.x, stageRect.width, lensSize, 'before'),
        y: resolveLensAxis(stagePoint.y, stageRect.height, lensSize, 'before'),
        backgroundImage: `url(${JSON.stringify(imageUrl)})`,
        backgroundSize: `${backgroundWidth}px ${backgroundHeight}px`,
        backgroundPosition: `${backgroundPositionX}px ${backgroundPositionY}px`,
        magnificationLabel: formatMagnificationLabel(lensMagnification)
      });
    },
    [
      active,
      displayScale,
      imageUrl,
      lensMagnification,
      lensSize,
      metrics,
      resolveDisplayPoint,
      stageRef,
      suspended
    ]
  );

  useEffect(() => {
    if (!active || suspended || !imageUrl || !metrics) {
      setCrosshair(null);
      setLens(null);
    }
  }, [active, imageUrl, metrics, suspended]);

  return {
    clear,
    crosshair,
    lens,
    updateFromClientPoint
  };
};
