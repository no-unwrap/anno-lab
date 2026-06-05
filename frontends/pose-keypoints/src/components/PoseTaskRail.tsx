import { PanelSection } from '@anno-lab/shared';

import { formatPixels, getStatusLabel } from '../poseState';
import type { Keypoint } from '../types';

interface PoseTaskRailProps {
  keypoints: Keypoint[];
  resolvedCount: number;
  resolvedImageUrl?: string;
  selectedLandmarkId: string | null;
  subjectLabel: string;
  taskId?: number;
  taskTypeSlug?: string;
}

export const PoseTaskRail = ({
  keypoints,
  resolvedCount,
  resolvedImageUrl,
  selectedLandmarkId,
  subjectLabel,
  taskId,
  taskTypeSlug
}: PoseTaskRailProps) => (
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
            <dd>{taskId ?? 'Preview'}</dd>
          </div>
          <div>
            <dt>Task type</dt>
            <dd>{taskTypeSlug ?? 'pose_keypoints'}</dd>
          </div>
          <div>
            <dt>Subject</dt>
            <dd>{subjectLabel}</dd>
          </div>
          <div>
            <dt>Resolved</dt>
            <dd>
              {resolvedCount}/{keypoints.length}
            </dd>
          </div>
        </dl>
      </div>
    </PanelSection>
    <PanelSection title="Landmark order" eyebrow="Task definition">
      <ol className="pose-landmark-order">
        {keypoints.map((keypoint, index) => (
          <li
            key={keypoint.landmarkId}
            className={selectedLandmarkId === keypoint.landmarkId ? 'is-active' : ''}
          >
            <div>
              <strong>
                {index + 1}. {keypoint.label}
              </strong>
              <p>
                {keypoint.point
                  ? `${formatPixels(keypoint.point.x)}, ${formatPixels(keypoint.point.y)}`
                  : 'Awaiting placement'}
              </p>
            </div>
            <span className={`pose-status-tag is-${keypoint.state}`}>
              {getStatusLabel(keypoint.state)}
            </span>
          </li>
        ))}
      </ol>
    </PanelSection>
  </>
);
