import React from 'react';

import { ToastMessage } from '../types';

interface ToastRegionProps {
  items: ToastMessage[];
}

export const ToastRegion = ({ items }: ToastRegionProps) => {
  if (!items.length) {
    return null;
  }

  return (
    <div className="anno-lab-toast-region" aria-live="polite" aria-atomic="true">
      {items.map((item) => (
        <article key={item.id} className={`anno-lab-toast anno-lab-toast--${item.tone}`}>
          <strong>{item.title}</strong>
          <p>{item.message}</p>
        </article>
      ))}
    </div>
  );
};
