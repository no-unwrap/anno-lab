import React, { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  body: string;
  action?: ReactNode;
}

export const EmptyState = ({ title, body, action }: EmptyStateProps) => (
  <div className="anno-lab-empty-state">
    <h3>{title}</h3>
    <p>{body}</p>
    {action}
  </div>
);
