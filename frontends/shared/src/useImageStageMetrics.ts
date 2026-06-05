import { RefObject, useCallback, useEffect, useState } from 'react';

import { ImageMetrics } from './types';

interface UseImageStageMetricsOptions {
  imageRef: RefObject<HTMLImageElement | null>;
  fallbackNaturalWidth?: number | null;
  fallbackNaturalHeight?: number | null;
}

export const useImageStageMetrics = ({
  imageRef,
  fallbackNaturalWidth = null,
  fallbackNaturalHeight = null
}: UseImageStageMetricsOptions) => {
  const [metrics, setMetrics] = useState<ImageMetrics | null>(null);

  const refreshMetrics = useCallback(() => {
    const image = imageRef.current;
    if (!image) {
      return;
    }

    const naturalWidth = image.naturalWidth || fallbackNaturalWidth || image.width;
    const naturalHeight = image.naturalHeight || fallbackNaturalHeight || image.height;
    const renderedWidth = image.clientWidth;
    const renderedHeight = image.clientHeight;

    if (!naturalWidth || !naturalHeight || !renderedWidth || !renderedHeight) {
      return;
    }

    setMetrics({
      naturalWidth,
      naturalHeight,
      renderedWidth,
      renderedHeight
    });
  }, [fallbackNaturalHeight, fallbackNaturalWidth, imageRef]);

  useEffect(() => {
    refreshMetrics();
    window.addEventListener('resize', refreshMetrics);
    return () => window.removeEventListener('resize', refreshMetrics);
  }, [refreshMetrics]);

  return {
    metrics,
    refreshMetrics
  };
};
