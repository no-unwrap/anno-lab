import type { ImagePoint, ImageRect } from '@anno-lab/shared';

export interface BboxDefinition {
  instructions?: string;
  object_classes?: string[];
  min_box_size?: number;
}

export interface Box {
  id: string;
  label: string;
  rect: ImageRect;
}

export type ToolMode = 'draw' | 'select';

export type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se';

export type InteractionState =
  | null
  | { type: 'drawing'; start: ImagePoint; current: ImagePoint }
  | { type: 'moving'; boxId: string; start: ImagePoint; initialRect: ImageRect }
  | {
      type: 'resizing';
      boxId: string;
      handle: ResizeHandle;
      initialRect: ImageRect;
    };

export interface ClientPoint {
  clientX: number;
  clientY: number;
}
