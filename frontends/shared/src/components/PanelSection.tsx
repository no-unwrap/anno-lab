import React, { ReactNode } from 'react';

interface PanelSectionProps {
  title: string;
  eyebrow?: string;
  children: ReactNode;
}

export const PanelSection = ({ title, eyebrow, children }: PanelSectionProps) => (
  <section className="anno-lab-panel">
    <header className="anno-lab-panel__header">
      {eyebrow ? <p className="anno-lab-panel__eyebrow">{eyebrow}</p> : null}
      <h2>{title}</h2>
    </header>
    {children}
  </section>
);
