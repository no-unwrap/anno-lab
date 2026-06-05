import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installBootConfig, setElementRect } from '@anno-lab/shared/testing';

import App from './App';

const bundleResponse = {
  task: {
    id: 91,
    project: 1,
    asset: 5,
    task_definition: 9,
    status: 'pending',
    priority: 1,
    assigned_to: '',
    payload: {},
    created_at: '2026-03-14T00:00:00Z'
  },
  asset: {
    id: 5,
    project: 1,
    media_type: 'image/jpeg',
    s3_key: 'pose-example.jpg',
    sha256: 'abc',
    width: 1600,
    height: 1200,
    metadata: {},
    created_at: '2026-03-14T00:00:00Z'
  },
  asset_url: 'https://images.example.com/pose-example.jpg',
  task_type: {
    id: 9,
    slug: 'pose_keypoints',
    name: 'Pose Keypoints',
    description: 'Annotate one primary person with ordered landmarks'
  },
  task_definition: {
    id: 9,
    task_type: 9,
    version: '1.0.0',
    definition: {
      instructions: 'Label one primary person with ordered body landmarks.',
      subject_label: 'Primary person',
      landmarks: [
        { id: 'nose', label: 'Nose', color: '#f28f16' },
        { id: 'left_shoulder', label: 'Left shoulder', color: '#116466' },
        { id: 'right_shoulder', label: 'Right shoulder', color: '#3a7d44' },
        { id: 'pelvis', label: 'Pelvis', color: '#6d597a' }
      ],
      skeleton: [
        ['nose', 'left_shoulder'],
        ['nose', 'right_shoulder'],
        ['left_shoulder', 'pelvis'],
        ['right_shoulder', 'pelvis']
      ]
    },
    created_at: '2026-03-14T00:00:00Z'
  },
  plugin: {
    name: 'Pose Keypoints Annotator',
    task_type: 'pose_keypoints',
    version: '0.1.5',
    root: 'pose-keypoints/dist',
    css: ['assets/index.css'],
    js: ['assets/index.js'],
    result_schema_version: '1.0.0'
  }
};

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
  const overlay = document.querySelector('.pose-overlay') as HTMLElement | null;
  if (!stage || !overlay) {
    throw new Error('Expected stage and pose overlay.');
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

const getLandmarkRow = (label: string): HTMLButtonElement => {
  const row = Array.from(
    document.querySelectorAll<HTMLButtonElement>('.anno-lab-list-row')
  ).find((candidate) => candidate.textContent?.includes(label));
  if (!row) {
    throw new Error(`Expected landmark row for ${label}`);
  }
  return row;
};

describe('pose-keypoints App', () => {
  beforeEach(() => {
    installBootConfig({
      taskId: 91,
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
      json: async () => bundleResponse
    }));

    await renderApp(fetchMock);

    expect(
      await screen.findByText('Annotate one primary person with ordered keypoints')
    ).toBeInTheDocument();
    expect(document.querySelector('[data-toolbar-group="mode"]')).toBeInTheDocument();
    expect(document.querySelector('[data-toolbar-group="selection"]')).toBeInTheDocument();
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

  it('auto-advances landmarks, keeps selection synchronized, and preserves the submission schema', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => bundleResponse
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ id: 91 })
      });

    const { overlay } = await renderApp(fetchMock);

    fireEvent.mouseDown(overlay, { clientX: 120, clientY: 120 });

    const leftShoulderRow = getLandmarkRow('Left shoulder');
    const noseRow = getLandmarkRow('Nose');

    await waitFor(() => expect(leftShoulderRow).toHaveClass('is-active'));
    expect(noseRow).toHaveTextContent('240 px, 240 px');

    const nosePoint = document.querySelector('[data-landmark-id="nose"]') as SVGCircleElement | null;
    if (!nosePoint) {
      throw new Error('Expected rendered nose point.');
    }

    await user.click(noseRow);
    await waitFor(() => expect(noseRow).toHaveClass('is-active'));
    expect(nosePoint).toHaveClass('is-selected');

    await user.click(screen.getByRole('button', { name: 'Next landmark' }));
    await waitFor(() => expect(leftShoulderRow).toHaveClass('is-active'));

    fireEvent.mouseDown(overlay, { clientX: 180, clientY: 180 });
    await waitFor(() => expect(getLandmarkRow('Right shoulder')).toHaveClass('is-active'));

    fireEvent.mouseDown(overlay, { clientX: 240, clientY: 240 });
    await waitFor(() => expect(getLandmarkRow('Pelvis')).toHaveClass('is-active'));

    await user.click(screen.getByRole('button', { name: 'Not in frame' }));
    expect(getLandmarkRow('Pelvis')).toHaveTextContent('Not in frame');

    await user.click(screen.getByRole('button', { name: 'Submit keypoints' }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const annotationRequest = fetchMock.mock.calls[1];
    const payload = JSON.parse(String(annotationRequest[1]?.body));
    expect(payload.result.subject.type).toBe('pose_keypoints');
    expect(payload.result.subject.label).toBe('Primary person');
    expect(payload.result.subject.keypoints).toEqual([
      {
        id: 'nose',
        label: 'Nose',
        state: 'visible',
        point: { x: 240, y: 240 }
      },
      {
        id: 'left_shoulder',
        label: 'Left shoulder',
        state: 'visible',
        point: { x: 360, y: 360 }
      },
      {
        id: 'right_shoulder',
        label: 'Right shoulder',
        state: 'visible',
        point: { x: 480, y: 480 }
      },
      {
        id: 'pelvis',
        label: 'Pelvis',
        state: 'not_in_frame',
        point: null
      }
    ]);
    expect(payload.schema_version).toBe('1.0.0');
    expect(payload.tool_version).toBe('pose-keypoints@0.1.5');
    expect(payload.raw_payload.source).toBe('pose-keypoints');
    expect(await screen.findAllByText('Pose keypoints submitted successfully.')).toHaveLength(2);
  });

  it('shows shared crosshair guides and variable magnifier levels on the fit-first workspace', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => bundleResponse
    }));

    const { stage } = await renderApp(fetchMock);

    await user.click(screen.getByRole('button', { name: '1.5x' }));
    expect(screen.getByText('Magnifier level set to 1.5x.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Magnifier' }));
    fireEvent.mouseMove(stage, { clientX: 300, clientY: 300 });

    const magnifier = screen.getByTestId('pose-magnifier');
    expect(magnifier).toHaveStyle({
      transform: 'translate(104px, 104px)',
      backgroundSize: '1200px 900px'
    });
    expect(screen.getByTestId('pose-crosshair-vertical')).toHaveStyle({ left: '300px' });
    expect(screen.getByTestId('pose-crosshair-horizontal')).toHaveStyle({ top: '300px' });
    expect(screen.getByTestId('pose-crosshair-point')).toHaveStyle({
      left: '300px',
      top: '300px'
    });
    expect(screen.getByText('Fit')).toBeInTheDocument();

    fireEvent.mouseLeave(stage);
    expect(screen.queryByTestId('pose-magnifier')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pose-crosshair-point')).not.toBeInTheDocument();
  });
});
