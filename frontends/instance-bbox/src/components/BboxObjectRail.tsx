import { EmptyState, PanelSection } from '@anno-lab/shared';

import { formatPixels } from '../bboxGeometry';
import type { Box } from '../types';

interface BboxObjectRailProps {
  boxes: Box[];
  labels: string[];
  selectedBox: Box | null;
  isSelected: (boxId: string) => boolean;
  onSelectBox: (boxId: string, index: number) => void;
  onSelectLabel: (label: string) => void;
}

export const BboxObjectRail = ({
  boxes,
  labels,
  selectedBox,
  isSelected,
  onSelectBox,
  onSelectLabel
}: BboxObjectRailProps) => (
  <>
    <PanelSection title="Annotation objects" eyebrow="Selection sync">
      {boxes.length ? (
        <ul className="anno-lab-list">
          {boxes.map((box, index) => (
            <li key={box.id}>
              <button
                className={`anno-lab-list-row ${isSelected(box.id) ? 'is-active' : ''}`}
                type="button"
                onClick={() => onSelectBox(box.id, index)}
              >
                <strong>{box.label}</strong>
                <p>
                  {formatPixels(box.rect.width)} × {formatPixels(box.rect.height)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="No boxes yet"
          body="Switch to draw mode and drag inside the image to create the first box."
        />
      )}
    </PanelSection>
    <PanelSection title="Selected object" eyebrow="Box properties">
      {selectedBox ? (
        <>
          <div className="anno-lab-pill-list">
            {labels.map((label) => (
              <button
                key={label}
                className={`anno-lab-pill ${selectedBox.label === label ? 'is-active' : ''}`}
                type="button"
                onClick={() => onSelectLabel(label)}
              >
                {label}
              </button>
            ))}
          </div>
          <dl className="anno-lab-detail-list bbox-detail-list">
            <div>
              <dt>Origin</dt>
              <dd>
                {formatPixels(selectedBox.rect.x)}, {formatPixels(selectedBox.rect.y)}
              </dd>
            </div>
            <div>
              <dt>Size</dt>
              <dd>
                {formatPixels(selectedBox.rect.width)} × {formatPixels(selectedBox.rect.height)}
              </dd>
            </div>
          </dl>
        </>
      ) : (
        <EmptyState
          title="Select a box"
          body="Choose an object from the rail or click one in the canvas to edit its label."
        />
      )}
    </PanelSection>
  </>
);
