import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installBootConfig, setElementRect } from '@anno-lab/shared/testing';

import App from './App';

const buildBundleResponse = (payload: Record<string, unknown> = {}) => ({
  task: {
    id: 115,
    project: 1,
    asset: 7,
    task_definition: 18,
    status: 'pending',
    priority: 1,
    assigned_to: '',
    payload,
    created_at: '2026-03-30T00:00:00Z'
  },
  asset: {
    id: 7,
    project: 1,
    media_type: 'image/jpeg',
    s3_key: 'salient-tbi-example.jpg',
    sha256: 'abc',
    width: 1600,
    height: 1200,
    metadata: {},
    created_at: '2026-03-30T00:00:00Z'
  },
  asset_url: 'https://images.example.com/salient-tbi-example.jpg',
  task_type: {
    id: 18,
    slug: 'salient_tbi',
    name: 'Salient TBI',
    description: 'Identify the signal object and record scene metadata'
  },
  task_definition: {
    id: 18,
    task_type: 18,
    version: '1.0.0',
    definition: {
      instruction_text: 'Mark the one thing that draws your attention first.'
    },
    created_at: '2026-03-30T00:00:00Z'
  },
  plugin: {
    name: 'Salient TBI Annotator',
    task_type: 'salient_tbi',
    version: '0.1.0',
    root: 'salient-tbi/dist',
    css: ['assets/index.css'],
    js: ['assets/index.js'],
    result_schema_version: '1.0.0'
  }
});

const setImageMetrics = (
  image: HTMLImageElement,
  dimensions: { naturalWidth: number; naturalHeight: number; renderedWidth: number; renderedHeight: number }
) => {
  Object.defineProperty(image, 'naturalWidth', {
    configurable: true,
    value: dimensions.naturalWidth
  });
  Object.defineProperty(image, 'naturalHeight', {
    configurable: true,
    value: dimensions.naturalHeight
  });
  Object.defineProperty(image, 'clientWidth', {
    configurable: true,
    value: dimensions.renderedWidth
  });
  Object.defineProperty(image, 'clientHeight', {
    configurable: true,
    value: dimensions.renderedHeight
  });
  setElementRect(image, {
    width: dimensions.renderedWidth,
    height: dimensions.renderedHeight
  });
};

const renderApp = async (fetchMock: ReturnType<typeof vi.fn>) => {
  vi.stubGlobal('fetch', fetchMock);

  render(<App />);

  const image = (await screen.findByRole('img', {
    name: 'Annotation target'
  })) as HTMLImageElement;
  const stage = document.querySelector('.anno-lab-stage') as HTMLElement | null;
  const overlay = await screen.findByTestId('salient-tbi-overlay');
  if (!stage) {
    throw new Error('Expected stage to render.');
  }

  setElementRect(stage, { width: 800, height: 600 });
  setElementRect(overlay, { width: 800, height: 600 });
  setImageMetrics(image, {
    naturalWidth: 1600,
    naturalHeight: 1200,
    renderedWidth: 800,
    renderedHeight: 600
  });
  fireEvent.load(image);

  return { image, overlay };
};

describe('salient-tbi App', () => {
  beforeEach(() => {
    installBootConfig({
      taskId: 115,
      apiBase: '/api'
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('records a point target, supports the two-step flow, and submits the expected payload', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => buildBundleResponse()
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ id: 115 })
      });

    const { overlay } = await renderApp(fetchMock);

    fireEvent.mouseDown(overlay, { clientX: 200, clientY: 150 });

    expect(await screen.findByTestId('signal-point-marker')).toBeInTheDocument();
    expect(screen.getByTestId('selection-summary')).toHaveTextContent('Signal point selected');

    await user.click(screen.getByRole('button', { name: 'Continue to scene questions' }));
    expect(await screen.findByRole('button', { name: 'Edit selection' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '4' }));
    await user.click(screen.getByRole('button', { name: 'Hard' }));
    await user.click(screen.getByRole('button', { name: 'Submit signal annotation' }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const annotationRequest = fetchMock.mock.calls[1];
    const payload = JSON.parse(String(annotationRequest[1]?.body));

    expect(payload.result).toEqual({
      mode: 'signal',
      target: {
        kind: 'point',
        label: 'primary_signal_point',
        point: { x: 400, y: 300 }
      },
      scene_report: {
        overwhelm_rating: 4,
        search_difficulty: 'hard'
      }
    });
    expect(payload.schema_version).toBe('1.0.0');
    expect(payload.tool_version).toBe('salient-tbi@0.1.0');
    expect(payload.raw_payload.source).toBe('salient-tbi');
    expect(payload.raw_payload.interaction.initial_positive_point).toEqual({
      x: 400,
      y: 300
    });
    expect(payload.raw_payload.interaction.refinement_prompts).toEqual([]);
    expect(payload.raw_payload.model.proposal_available).toBe(false);
    expect(await screen.findAllByText('Signal annotation submitted successfully.')).toHaveLength(2);
  });

  it('accepts a deterministic pre-annotation proposal and skips search difficulty for diffuse scenes', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildBundleResponse({
            pre_annotations: {
              schema_version: '1.0.0',
              predictions: [
                {
                  id: 'seed-1',
                  kind: 'polygon',
                  label: 'signal_region',
                  score: 0.91,
                  points: [
                    { x: 100, y: 140 },
                    { x: 300, y: 150 },
                    { x: 260, y: 360 }
                  ]
                }
              ]
            }
          })
      })
      .mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ id: 115 })
      });

    await renderApp(fetchMock);

    await user.click(screen.getByRole('button', { name: 'Accept region' }));
    await user.click(screen.getByRole('button', { name: 'Continue to scene questions' }));
    await user.click(screen.getByRole('button', { name: 'Edit selection' }));
    await user.click(screen.getByRole('button', { name: 'Diffuse scene' }));
    await user.click(screen.getByRole('button', { name: 'Continue to scene questions' }));

    expect(screen.getByText('Search difficulty is recorded as unavailable when the scene is marked as diffuse.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '2' }));
    await user.click(screen.getByRole('button', { name: 'Submit signal annotation' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const annotationRequest = fetchMock.mock.calls[1];
    const payload = JSON.parse(String(annotationRequest[1]?.body));

    expect(payload.result.target).toEqual({
      kind: 'scene',
      label: 'diffuse_scene'
    });
    expect(payload.result.scene_report).toEqual({
      overwhelm_rating: 2,
      search_difficulty: null
    });
    expect(payload.raw_payload.model.proposal_available).toBe(true);
    expect(payload.raw_payload.model.proposal_used).toBe(false);
  });
});
