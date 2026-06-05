import React from 'react';

import { FeedbackState, ShortcutHint, StatusMetaItem } from '../types';

interface StatusFooterProps {
  feedback: FeedbackState;
  meta: StatusMetaItem[];
  shortcuts: ShortcutHint[];
}

export const StatusFooter = ({ feedback, meta, shortcuts }: StatusFooterProps) => (
  <footer className={`anno-lab-status-footer anno-lab-status-footer--${feedback.tone}`}>
    <div className="anno-lab-status-footer__summary">
      <p className="anno-lab-status-footer__label">{feedback.label || 'Workspace status'}</p>
      <p className="anno-lab-status-footer__message">{feedback.message}</p>
    </div>
    <dl className="anno-lab-meta-grid">
      {meta.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
    <ul className="anno-lab-kbd-list">
      {shortcuts.map((shortcut) => (
        <li key={`${shortcut.keyLabel}-${shortcut.description}`}>
          <span>{shortcut.keyLabel}</span>
          {shortcut.description}
        </li>
      ))}
    </ul>
  </footer>
);
