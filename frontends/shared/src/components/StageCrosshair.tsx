import React from 'react';

import type { HoverCrosshairState } from '../useHoverMagnifier';

interface StageCrosshairProps {
  crosshair: HoverCrosshairState | null;
  testIdPrefix?: string;
}

export const StageCrosshair = ({
  crosshair,
  testIdPrefix
}: StageCrosshairProps) => {
  if (!crosshair) {
    return null;
  }

  return (
    <div aria-hidden="true" className="anno-lab-crosshair">
      <span
        className="anno-lab-crosshair__line anno-lab-crosshair__line--vertical"
        data-testid={testIdPrefix ? `${testIdPrefix}-vertical` : undefined}
        style={{ left: `${crosshair.x}px` }}
      />
      <span
        className="anno-lab-crosshair__line anno-lab-crosshair__line--horizontal"
        data-testid={testIdPrefix ? `${testIdPrefix}-horizontal` : undefined}
        style={{ top: `${crosshair.y}px` }}
      />
      <span
        className="anno-lab-crosshair__point"
        data-testid={testIdPrefix ? `${testIdPrefix}-point` : undefined}
        style={{
          left: `${crosshair.x}px`,
          top: `${crosshair.y}px`
        }}
      />
    </div>
  );
};
