import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installBootConfig, setElementRect } from '@anno-lab/shared/testing';

import App from './App';

const buildBundleResponse = (
  taskOverrides: Partial<{
    payload: Record<string, unknown>;
  }> = {}
) => ({
  task: {
    id: 84,
    project: 1,
    asset: 4,
    task_definition: 8,
    status: 'pending',
    priority: 1,
    assigned_to: '',
    payload: {},
    created_at: '2026-03-14T00:00:00Z',
    ...taskOverrides
  },
  asset: {
    id: 4,
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
    id: 8,
    slug: 'instance_bbox',
    name: 'Instance Bounding Box',
    description: 'Draw labeled bounding boxes around visible object instances'
  },
  task_definition: {
    id: 8,
    task_type: 8,
    version: '1.0.0',
    definition: {
      instructions: 'Draw all visible objects.',
      object_classes: ['person', 'vehicle'],
      min_box_size: 12
    },
    created_at: '2026-03-14T00:00:00Z'
  },
  plugin: {
    name: 'Instance Bounding Box Annotator',
    task_type: 'instance_bbox',
    version: '0.1.5',
    root: 'instance-bbox/dist',
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
  const overlay = document.querySelector('.bbox-overlay') as HTMLElement | null;
  if (!stage || !overlay) {
    throw new Error('Expected stage and bbox overlay.');
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

const drawOneBox = (overlay: HTMLElement) => {
  fireEvent.mouseDown(overlay, { clientX: 80, clientY: 80 });
  fireEvent.mouseMove(document, { clientX: 240, clientY: 220 });
  fireEvent.mouseUp(document);
};

describe('instance-bbox App', () => {
  beforeEach(() => {
    installBootConfig({
      taskId: 84,
      apiBase: '/api'
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the standardized fit-first shell and removes viewport controls', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => buildBundleResponse()
    }));

    await renderApp(fetchMock);

    expect(
      await screen.findByText('Annotate visible instances with bounding boxes')
    ).toBeInTheDocument();
    expect(document.querySelector('[data-anno-lab-shell="workspace"]')).toBeInTheDocument();
    expect(document.querySelector('[data-toolbar-group="mode"]')).toBeInTheDocument();
    expect(document.querySelector('[data-toolbar-group="precision"]')).toBeInTheDocument();
    expect(document.querySelector('[data-toolbar-group="history"]')).toBeInTheDocument();
    expect(document.querySelector('[data-toolbar-group="annotation"]')).toBeInTheDocument();
    expect(document.querySelector('[data-toolbar-group="viewport"]')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Magnifier' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1.5x' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3x' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '5x' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pan' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '1:1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fit frame' })).not.toBeInTheDocument();
    expect(screen.getByText('Fit')).toBeInTheDocument();
  });

  it('keeps selection synchronized and submits unchanged bbox geometry in natural image pixels', async () => {
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
        json: async () => ({ id: 55 })
      });

    const { overlay } = await renderApp(fetchMock);

    drawOneBox(overlay);

    const objectRow = await waitFor(() => {
      const row = document.querySelector('.anno-lab-list-row') as HTMLButtonElement | null;
      expect(row).not.toBeNull();
      return row;
    });
    expect(objectRow).toHaveClass('is-active');
    expect(objectRow).toHaveTextContent('320 px × 280 px');

    const canvasBox = document.querySelector('[data-box-id]') as SVGRectElement | null;
    if (!canvasBox) {
      throw new Error('Expected rendered bbox.');
    }

    fireEvent.mouseDown(canvasBox, { clientX: 120, clientY: 120 });
    expect(objectRow).toHaveClass('is-active');
    expect(canvasBox).toHaveClass('is-selected');

    await user.click(screen.getByRole('button', { name: 'Submit boxes' }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const annotationRequest = fetchMock.mock.calls[1];
    const payload = JSON.parse(String(annotationRequest[1]?.body));
    expect(payload.result.objects).toEqual([
      expect.objectContaining({
        label: 'person',
        bbox: {
          x: expect.any(Number),
          y: expect.any(Number),
          width: 320,
          height: 280
        }
      })
    ]);
    expect(payload.schema_version).toBe('1.0.0');
    expect(payload.tool_version).toBe('instance-bbox@0.1.5');
    expect(payload.raw_payload.source).toBe('instance-bbox');
    expect(await screen.findAllByText('Bounding boxes submitted successfully.')).toHaveLength(2);
  });

  it('loads bbox pre-annotations from Task.payload as editable starting boxes', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildBundleResponse({
            payload: {
              pre_annotations: {
                schema_version: '1.0.0',
                predictions: [
                  {
                    id: 'prediction-person',
                    kind: 'bbox',
                    label: 'person',
                    score: 0.98,
                    bbox: { x: 80, y: 120, width: 240, height: 320 }
                  },
                  {
                    id: 'prediction-vehicle',
                    kind: 'bbox',
                    label: 'vehicle',
                    score: 0.87,
                    bbox: { x: 480, y: 300, width: 360, height: 220 }
                  }
                ]
              }
            }
          })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ id: 56 })
      });

    await renderApp(fetchMock);

    expect(
      await screen.findByText(
        'Loaded 2 predicted boxes from Task.payload. Review and refine before submitting.'
      )
    ).toBeInTheDocument();

    const rows = await waitFor(() => {
      const nextRows = Array.from(document.querySelectorAll('.anno-lab-list-row'));
      expect(nextRows).toHaveLength(2);
      return nextRows as HTMLButtonElement[];
    });

    expect(rows[0]).toHaveTextContent('person');
    expect(rows[1]).toHaveTextContent('vehicle');
    expect(screen.getByRole('button', { name: 'Select' })).toHaveClass('is-active');

    await user.click(rows[1]);
    const pills = await waitFor(() => {
      const nextPills = Array.from(document.querySelectorAll('button.anno-lab-pill'));
      expect(nextPills).toHaveLength(2);
      return nextPills as HTMLButtonElement[];
    });
    await user.click(pills[0]);

    expect(rows[1]).toHaveTextContent('person');

    await user.click(screen.getByRole('button', { name: 'Submit boxes' }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const annotationRequest = fetchMock.mock.calls[1];
    const payload = JSON.parse(String(annotationRequest[1]?.body));
    expect(payload.result.objects).toEqual([
      {
        id: 'prediction-person',
        label: 'person',
        bbox: { x: 80, y: 120, width: 240, height: 320 }
      },
      {
        id: 'prediction-vehicle',
        label: 'person',
        bbox: { x: 480, y: 300, width: 360, height: 220 }
      }
    ]);
  });

  it('shows shared crosshair guides and updates the magnifier level without changing the fit view', async () => {
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

    const magnifier = screen.getByTestId('bbox-magnifier');
    expect(magnifier).toHaveStyle({
      transform: 'translate(104px, 104px)',
      backgroundSize: '4000px 3000px'
    });
    expect(screen.getByTestId('bbox-crosshair-vertical')).toHaveStyle({ left: '300px' });
    expect(screen.getByTestId('bbox-crosshair-horizontal')).toHaveStyle({ top: '300px' });
    expect(screen.getByTestId('bbox-crosshair-point')).toHaveStyle({
      left: '300px',
      top: '300px'
    });
    expect(
      screen.getByText('Precision mode on at 5x with crosshair guides.')
    ).toBeInTheDocument();
    expect(screen.getByText('Fit')).toBeInTheDocument();

    fireEvent.mouseLeave(stage);
    expect(screen.queryByTestId('bbox-magnifier')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bbox-crosshair-point')).not.toBeInTheDocument();
  });
});
