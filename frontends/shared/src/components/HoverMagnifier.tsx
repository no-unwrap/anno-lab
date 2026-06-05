import React, { type CSSProperties } from 'react';

import type { HoverMagnifierState } from '../useHoverMagnifier';

interface HoverMagnifierProps {
  lens: HoverMagnifierState | null;
  testId?: string;
}

export const HoverMagnifier = ({ lens, testId }: HoverMagnifierProps) => {
  if (!lens) {
    return null;
  }

  const style: CSSProperties = {
    transform: `translate(${lens.x}px, ${lens.y}px)`,
    backgroundImage: lens.backgroundImage,
    backgroundPosition: lens.backgroundPosition,
    backgroundSize: lens.backgroundSize
  };

  return (
    <div
      aria-hidden="true"
      className="anno-lab-magnifier"
      data-testid={testId}
      style={style}
    >
      <div className="anno-lab-magnifier__reticle" />
      <span className="anno-lab-magnifier__badge">{lens.magnificationLabel}</span>
    </div>
  );
};
