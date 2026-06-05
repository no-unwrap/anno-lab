import React, { ReactNode } from 'react';

import { ShortcutHint, ToastMessage } from '../types';
import { ToastRegion } from './ToastRegion';

interface WorkspaceShellProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  shortcuts: ShortcutHint[];
  toolbar?: ReactNode;
  leftRail?: ReactNode;
  rightRail?: ReactNode;
  footer?: ReactNode;
  toasts?: ToastMessage[];
  children: ReactNode;
}

export const WorkspaceShell = ({
  eyebrow,
  title,
  subtitle,
  shortcuts,
  toolbar,
  leftRail,
  rightRail,
  footer,
  toasts = [],
  children
}: WorkspaceShellProps) => (
  <div className="anno-lab-shell" data-anno-lab-shell="workspace">
    <div className="anno-lab-shell__mobile-guard">
      <h2>Viewport too small for annotation</h2>
      <p>Use a wider desktop or tablet viewport to keep the editor safe and legible.</p>
    </div>
    <ToastRegion items={toasts} />
    <header className="anno-lab-shell__header" data-shell-region="header">
      <div>
        <p className="anno-lab-shell__eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="anno-lab-shell__subtitle">{subtitle}</p>
      </div>
      <ul className="anno-lab-kbd-list">
        {shortcuts.map((shortcut) => (
          <li key={`${shortcut.keyLabel}-${shortcut.description}`}>
            <span>{shortcut.keyLabel}</span>
            {shortcut.description}
          </li>
        ))}
      </ul>
    </header>
    <div className="anno-lab-shell__body">
      {leftRail ? (
        <aside className="anno-lab-shell__rail" data-shell-region="left-rail">
          {leftRail}
        </aside>
      ) : null}
      <section className="anno-lab-shell__main">
        {toolbar ? (
          <div className="anno-lab-shell__toolbar" data-shell-region="toolbar">
            {toolbar}
          </div>
        ) : null}
        <div className="anno-lab-shell__workspace" data-shell-region="workspace">
          {children}
        </div>
        {footer ? (
          <div data-shell-region="footer">
            {footer}
          </div>
        ) : null}
      </section>
      {rightRail ? (
        <aside className="anno-lab-shell__rail" data-shell-region="right-rail">
          {rightRail}
        </aside>
      ) : null}
    </div>
  </div>
);
