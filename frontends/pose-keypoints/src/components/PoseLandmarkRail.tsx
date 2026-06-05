import { EmptyState, PanelSection } from '@anno-lab/shared';

import { formatPixels, getStatusLabel } from '../poseState';
import type { Keypoint, KeypointState } from '../types';

interface PoseLandmarkRailProps {
  keypoints: Keypoint[];
  onSelectLandmark: (landmarkId: string, message: string) => void;
  onSetSelectedKeypointState: (state: KeypointState) => void;
  selectedKeypoint: Keypoint | null;
  selectedLandmarkId: string | null;
}

export const PoseLandmarkRail = ({
  keypoints,
  onSelectLandmark,
  onSetSelectedKeypointState,
  selectedKeypoint,
  selectedLandmarkId
}: PoseLandmarkRailProps) => (
  <>
    <PanelSection title="Landmark list" eyebrow="Selection sync">
      {keypoints.length ? (
        <ul className="anno-lab-list">
          {keypoints.map((keypoint) => (
            <li key={keypoint.landmarkId}>
              <button
                className={`anno-lab-list-row ${selectedLandmarkId === keypoint.landmarkId ? 'is-active' : ''}`}
                type="button"
                onClick={() =>
                  onSelectLandmark(
                    keypoint.landmarkId,
                    `${keypoint.label} selected from the landmark rail.`
                  )
                }
              >
                <div className="pose-list-row__top">
                  <strong>{keypoint.label}</strong>
                  <span className={`pose-status-tag is-${keypoint.state}`}>
                    {getStatusLabel(keypoint.state)}
                  </span>
                </div>
                <p>
                  {keypoint.point
                    ? `${formatPixels(keypoint.point.x)}, ${formatPixels(keypoint.point.y)}`
                    : 'No coordinates yet'}
                </p>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="No landmarks configured"
          body="Add ordered landmark definitions to the task before annotating."
        />
      )}
    </PanelSection>
    <PanelSection title="Selected landmark" eyebrow="Point state">
      {selectedKeypoint ? (
        <>
          <div className="anno-lab-pill-list">
            <button
              className={`anno-lab-pill ${selectedKeypoint.state === 'visible' ? 'is-active' : ''}`}
              type="button"
              onClick={() => onSetSelectedKeypointState('visible')}
              disabled={!selectedKeypoint.point}
            >
              Visible
            </button>
            <button
              className={`anno-lab-pill ${selectedKeypoint.state === 'occluded' ? 'is-active' : ''}`}
              type="button"
              onClick={() => onSetSelectedKeypointState('occluded')}
              disabled={!selectedKeypoint.point}
            >
              Occluded
            </button>
            <button
              className={`anno-lab-pill ${selectedKeypoint.state === 'not_in_frame' ? 'is-active' : ''}`}
              type="button"
              onClick={() => onSetSelectedKeypointState('not_in_frame')}
            >
              Not in frame
            </button>
          </div>
          <div className="pose-point-detail">
            <strong>{selectedKeypoint.label}</strong>
            <p>
              Status:{' '}
              <span className={`pose-status-tag is-${selectedKeypoint.state}`}>
                {getStatusLabel(selectedKeypoint.state)}
              </span>
            </p>
            <p>
              {selectedKeypoint.point
                ? `Coordinates: ${formatPixels(selectedKeypoint.point.x)}, ${formatPixels(selectedKeypoint.point.y)}`
                : 'No coordinates recorded yet.'}
            </p>
            <p>
              {selectedKeypoint.state === 'pending'
                ? 'Use place mode to click this landmark into the image.'
                : selectedKeypoint.state === 'not_in_frame'
                  ? 'This landmark is intentionally omitted from the image plane.'
                  : 'Drag the point in the canvas to refine its location.'}
            </p>
          </div>
        </>
      ) : (
        <EmptyState
          title="Select a landmark"
          body="Choose a landmark from the rail or click a placed point in the canvas."
        />
      )}
    </PanelSection>
  </>
);
