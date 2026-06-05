import { EmptyState, PanelSection } from '@anno-lab/shared';

import {
  formatPolygonName
} from '../salientGeometry';
import type { DisplayPolygon } from '../types';

interface SalientAnnotationRailProps {
  canMoveSelectedPolygonEarlier: boolean;
  canMoveSelectedPolygonLater: boolean;
  canTogglePointRemoval: boolean;
  canResetAll: boolean;
  canSubmit: boolean;
  displayPolygons: DisplayPolygon[];
  draftClosePreviewActive: boolean;
  draftPointsCount: number;
  isSubmitting: boolean;
  minPoints: number;
  onClearAll: () => void;
  onMoveSelectedPolygonEarlier: () => void;
  onMoveSelectedPolygonLater: () => void;
  onSelectPolygon: (polygon: DisplayPolygon) => void;
  onSubmit: () => void;
  onTogglePointRemoval: () => void;
  pointRemovalModeActive: boolean;
  selectedPolygon: DisplayPolygon | null;
  selectedPolygonId: string | null;
}

export const SalientAnnotationRail = ({
  canMoveSelectedPolygonEarlier,
  canMoveSelectedPolygonLater,
  canTogglePointRemoval,
  canResetAll,
  canSubmit,
  displayPolygons,
  draftClosePreviewActive,
  draftPointsCount,
  isSubmitting,
  minPoints,
  onClearAll,
  onMoveSelectedPolygonEarlier,
  onMoveSelectedPolygonLater,
  onSelectPolygon,
  onSubmit,
  onTogglePointRemoval,
  pointRemovalModeActive,
  selectedPolygon,
  selectedPolygonId
}: SalientAnnotationRailProps) => (
  <>
    <PanelSection title="Annotation objects" eyebrow="Selection sync">
      {displayPolygons.length ? (
        <ul className="anno-lab-list">
          {displayPolygons.map((polygon) => (
            <li key={polygon.id}>
              <button
                className={`anno-lab-list-row ${selectedPolygonId === polygon.id ? 'is-active' : ''}`}
                type="button"
                onClick={() => onSelectPolygon(polygon)}
              >
                <strong>{formatPolygonName(polygon.index)}</strong>
                <p>Closed polygon · {polygon.points.length} vertices</p>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="No polygons yet"
          body="Click inside the editor to start outlining the first salient object."
        />
      )}
      {draftPointsCount ? (
        <div className="salient-draft-card">
          <strong>{formatPolygonName(displayPolygons.length)} draft</strong>
          <p>
            {draftClosePreviewActive
              ? 'Ready to close on click. Click the highlighted first vertex or press Enter.'
              : `${draftPointsCount} vertices recorded. Hover over the first vertex, then click it or press Enter to close.`}
          </p>
        </div>
      ) : null}
    </PanelSection>
    <PanelSection title="Selected object" eyebrow="Polygon properties">
      {selectedPolygon ? (
        <>
          <dl className="anno-lab-detail-list">
            <div>
              <dt>Name</dt>
              <dd>{formatPolygonName(selectedPolygon.index)}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>Closed</dd>
            </div>
            <div>
              <dt>Vertices</dt>
              <dd>{selectedPolygon.points.length}</dd>
            </div>
            <div>
              <dt>Order</dt>
              <dd>
                {selectedPolygon.index + 1} of {displayPolygons.length}
              </dd>
            </div>
            <div>
              <dt>Schema label</dt>
              <dd>{selectedPolygon.label}</dd>
            </div>
          </dl>
          {displayPolygons.length > 1 ? (
            <div className="salient-inline-actions">
              <button
                className="anno-lab-button anno-lab-button--ghost"
                type="button"
                onClick={onMoveSelectedPolygonEarlier}
                disabled={!canMoveSelectedPolygonEarlier}
              >
                Move earlier
              </button>
              <button
                className="anno-lab-button anno-lab-button--ghost"
                type="button"
                onClick={onMoveSelectedPolygonLater}
                disabled={!canMoveSelectedPolygonLater}
              >
                Move later
              </button>
            </div>
          ) : null}
          <div className="salient-inline-actions">
            <button
              className={`anno-lab-button anno-lab-button--ghost ${pointRemovalModeActive ? 'is-active' : ''}`}
              type="button"
              onClick={onTogglePointRemoval}
              disabled={!canTogglePointRemoval}
            >
              {pointRemovalModeActive ? 'Cancel point removal' : 'Remove point'}
            </button>
          </div>
          <div className="salient-point-editing-hint">
            <strong>Point editing</strong>
            <p>
              {pointRemovalModeActive
                ? `Click a vertex handle in the canvas to remove it. anno-lab keeps at least ${minPoints} points per closed polygon.`
                : 'Click midpoint handles in the canvas to insert vertices. Arm point removal only when the selected polygon needs fewer vertices.'}
            </p>
          </div>
        </>
      ) : (
        <EmptyState
          title="Select a polygon"
          body="Choose an object from the rail or click a polygon in the canvas."
        />
      )}
    </PanelSection>
    <PanelSection title="Submission" eyebrow="Result schema 2.0.0">
      <div className="anno-lab-pill-list">
        <span className="anno-lab-pill is-active">Multi-object stock mode</span>
        <span className={`anno-lab-pill ${displayPolygons.length ? 'is-active' : ''}`}>
          {displayPolygons.length} closed polygons
        </span>
        <span className={`anno-lab-pill ${draftPointsCount ? 'is-active' : ''}`}>
          Draft {draftPointsCount}
        </span>
      </div>
      <div className="salient-actions">
        <button
          className="anno-lab-button anno-lab-button--primary"
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
        >
          {isSubmitting ? 'Submitting…' : 'Submit polygons'}
        </button>
        <button
          className="anno-lab-button anno-lab-button--ghost"
          type="button"
          onClick={onClearAll}
          disabled={!canResetAll}
        >
          Reset all polygons
        </button>
      </div>
    </PanelSection>
  </>
);
