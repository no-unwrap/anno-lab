import { PanelSection } from '@anno-lab/shared';
import type { TaskBundle } from '@anno-lab/shared';

import type { SalientDefinition } from '../types';

interface SalientTaskRailProps {
  instructionText: string;
  resolvedImageUrl?: string;
  taskSnapshot: TaskBundle<SalientDefinition> | null;
}

export const SalientTaskRail = ({
  instructionText,
  resolvedImageUrl,
  taskSnapshot
}: SalientTaskRailProps) => (
  <>
    <PanelSection title="Task snapshot" eyebrow="Current asset">
      <div className="anno-lab-thumbnail-card">
        {resolvedImageUrl ? (
          <img alt="Task preview" src={resolvedImageUrl} />
        ) : (
          <div className="anno-lab-thumbnail-card__placeholder">Awaiting asset URL</div>
        )}
        <dl className="anno-lab-detail-list">
          <div>
            <dt>Task</dt>
            <dd>{taskSnapshot?.task.id ?? 'Preview'}</dd>
          </div>
          <div>
            <dt>Task type</dt>
            <dd>{taskSnapshot?.task_type.slug ?? 'salient_poly'}</dd>
          </div>
          <div>
            <dt>Asset pixels</dt>
            <dd>
              {taskSnapshot?.asset.width ?? '—'} × {taskSnapshot?.asset.height ?? '—'}
            </dd>
          </div>
          <div>
            <dt>Object mode</dt>
            <dd>Multiple</dd>
          </div>
        </dl>
      </div>
    </PanelSection>
    <PanelSection title="Instructions" eyebrow="Task definition">
      <p>{instructionText}</p>
    </PanelSection>
  </>
);
