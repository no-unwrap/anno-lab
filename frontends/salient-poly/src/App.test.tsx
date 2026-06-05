import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installBootConfig, setElementRect } from '@anno-lab/shared/testing';

import App from './App';

const buildBundleResponse = (
  definitionOverrides: Partial<{
    instructions: string;
    min_points: number;
  }> = {}
) => ({
  task: {
    id: 42,
    project: 1,
    asset: 7,
    task_definition: 3,
    status: 'pending',
    priority: 1,
    assigned_to: '',
    payload: {},
    created_at: '2026-03-14T00:00:00Z'
  },
  asset: {
    id: 7,
    project: 1,
    media_type: 'image/jpeg',
    s3_key: 'example.jpg',
    sha256: 'abc',
    width: 1600,
    height: 1200,
    metadata: {},
    created_at: '2026-03-14T00:00:00Z'
  },
  asset_url: 'https://images.example.com/example.jpg',
  task_type: {
    id: 3,
    slug: 'salient_poly',
    name: 'Salient Polygon',
    description: 'Trace salient objects with polygons'
  },
  task_definition: {
    id: 3,
    task_type: 3,
    version: '1.0.0',
    definition: {
      instructions: 'Trace each salient object with its own polygon.',
      min_points: 3,
      ...definitionOverrides
    },
    created_at: '2026-03-14T00:00:00Z'
  },
  plugin: {
    name: 'Salient Polygon Annotator',
    task_type: 'salient_poly',
    version: '0.2.7',
    root: 'salient-poly/dist',
    css: ['assets/index.css'],
    js: ['assets/index.js'],
    result_schema_version: '2.0.0'
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
  const overlay = document.querySelector('.salient-overlay') as HTMLElement | null;
  if (!stage || !overlay) {
    throw new Error('Expected stage and salient overlay.');
  }

  setElementRect(stage, { width: 800, height: 600 });
  setImageMetrics(image, {
    naturalWidth: 1600,
    naturalHeight: 1200,
    renderedWidth: 800,
    renderedHeight: 600
  });
  fireEvent.load(image);

  return { image, stage, overlay };
};

const drawClosedPolygon = (overlay: HTMLElement, points: Array<{ clientX: number; clientY: number }>) => {
  for (const point of points) {
    fireEvent.click(overlay, point);
  }
  fireEvent.keyDown(document, { key: 'Enter' });
};

describe('salient-poly App', () => {
  beforeEach(() => {
    installBootConfig({
      taskId: 42,
      apiBase: '/api'
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the standardized fit-first shell and keeps the stock multi-object workspace only', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => buildBundleResponse()
    }));

    await renderApp(fetchMock);

    expect(await screen.findByText('Trace salient objects with polygons')).toBeInTheDocument();
    expect(document.querySelector('[data-toolbar-group="mode"]')).toBeInTheDocument();
    expect(document.querySelector('[data-toolbar-group="precision"]')).toBeInTheDocument();
    expect(document.querySelector('[data-toolbar-group="history"]')).toBeInTheDocument();
    expect(document.querySelector('[data-toolbar-group="annotation"]')).toBeInTheDocument();
    expect(document.querySelector('[data-toolbar-group="viewport"]')).not.toBeInTheDocument();
    expect(screen.getByText('Multi-object stock mode')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pan' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '1:1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fit frame' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Magnifier' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1.5x' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3x' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '5x' })).toBeInTheDocument();
    expect(screen.getByText('Fit')).toBeInTheDocument();
  });

  it('shows shared crosshair guides and variable magnifier levels while keeping the canvas fitted', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => buildBundleResponse()
    }));

    const { stage } = await renderApp(fetchMock);

    await user.click(screen.getByRole('button', { name: '5x' }));
    expect(screen.getByText('Magnifier level set to 5x.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Magnifier' }));
    fireEvent.mouseMove(stage, { clientX: 300, clientY: 300 });

    const magnifier = screen.getByTestId('salient-magnifier');
    expect(magnifier).toHaveStyle({
      transform: 'translate(104px, 104px)',
      backgroundSize: '4000px 3000px'
    });
    expect(screen.getByTestId('salient-crosshair-vertical')).toHaveStyle({ left: '300px' });
    expect(screen.getByTestId('salient-crosshair-horizontal')).toHaveStyle({ top: '300px' });
    expect(screen.getByTestId('salient-crosshair-point')).toHaveStyle({
      left: '300px',
      top: '300px'
    });

    fireEvent.mouseLeave(stage);
    expect(screen.queryByTestId('salient-magnifier')).not.toBeInTheDocument();
    expect(screen.queryByTestId('salient-crosshair-point')).not.toBeInTheDocument();
  });

  it('keeps polygon close-preview behavior and submits the multi-object schema unchanged', async () => {
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
        json: async () => ({ id: 99 })
      });

    const { overlay, stage } = await renderApp(fetchMock);

    fireEvent.click(overlay, { clientX: 100, clientY: 100 });
    fireEvent.click(overlay, { clientX: 300, clientY: 120 });
    fireEvent.click(overlay, { clientX: 220, clientY: 300 });

    fireEvent.mouseMove(stage, { clientX: 102, clientY: 102 });

    const firstDraftVertex = document.querySelector(
      '[data-draft-vertex-index="0"]'
    ) as SVGCircleElement | null;
    if (!firstDraftVertex) {
      throw new Error('Expected first draft vertex.');
    }

    expect(firstDraftVertex.dataset.closeReady).toBe('true');
    expect(
      screen.getByText('Ready to close on click. Click the highlighted first vertex or press Enter.')
    ).toBeInTheDocument();

    fireEvent.click(overlay, { clientX: 102, clientY: 102 });
    expect(
      await screen.findByText('Object 1 closed. Click anywhere on the image to start another polygon.')
    ).toBeInTheDocument();

    drawClosedPolygon(overlay, [
      { clientX: 430, clientY: 110 },
      { clientX: 560, clientY: 170 },
      { clientX: 470, clientY: 320 }
    ]);

    expect(document.querySelectorAll('.anno-lab-list-row')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Submit polygons' }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const annotationRequest = fetchMock.mock.calls[1];
    const payload = JSON.parse(String(annotationRequest[1]?.body));
    expect(payload.result.objects).toEqual([
      {
        id: expect.any(String),
        type: 'polygon',
        label: 'salient_object',
        points: [
          [200, 200],
          [600, 240],
          [440, 600]
        ]
      },
      {
        id: expect.any(String),
        type: 'polygon',
        label: 'salient_object',
        points: [
          [860, 220],
          [1120, 340],
          [940, 640]
        ]
      }
    ]);
    expect(payload.schema_version).toBe('2.0.0');
    expect(payload.tool_version).toBe('salient-poly@0.2.7');
    expect(payload.raw_payload.source).toBe('salient-poly');
    expect(payload.raw_payload.ui.object_count).toBe(2);
    expect(await screen.findAllByText('Polygons submitted successfully.')).toHaveLength(2);
  });
});
