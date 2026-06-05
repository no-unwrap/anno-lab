export type FeedbackTone = 'neutral' | 'pending' | 'success' | 'danger' | 'warning';

export interface FeedbackState {
  tone: FeedbackTone;
  message: string;
  label?: string;
}

export interface BootMturkConfig {
  assignmentId: string;
  hitId: string;
  workerId: string;
  sandbox: boolean;
  submitUrl: string;
}

export interface BootConfig {
  raw: Record<string, unknown>;
  taskId?: number | string;
  apiBase: string;
  actor: string;
  submissionId?: string;
  mturk?: BootMturkConfig;
  writeToken?: string;
}

export interface TaskRecord {
  id: number;
  project: number;
  asset: number;
  task_definition: number;
  status: string;
  priority: number;
  assigned_to: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface TaskPreAnnotationBase {
  id?: string;
  label?: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface TaskPreAnnotationBbox extends TaskPreAnnotationBase {
  kind: 'bbox';
  bbox: ImageRect;
}

export interface TaskPreAnnotationPolygon extends TaskPreAnnotationBase {
  kind: 'polygon';
  points: ImagePoint[];
}

export type TaskPreAnnotationKeypointState =
  | 'visible'
  | 'occluded'
  | 'not_in_frame';

export interface TaskPreAnnotationKeypoint {
  id: string;
  label?: string;
  state?: TaskPreAnnotationKeypointState;
  point: ImagePoint | null;
}

export interface TaskPreAnnotationKeypoints extends TaskPreAnnotationBase {
  kind: 'keypoints';
  keypoints: TaskPreAnnotationKeypoint[];
}

export type TaskPreAnnotation =
  | TaskPreAnnotationBbox
  | TaskPreAnnotationPolygon
  | TaskPreAnnotationKeypoints;

export interface TaskPreAnnotations {
  schema_version: string;
  predictions: TaskPreAnnotation[];
  metadata?: Record<string, unknown>;
}

export interface AssetRecord {
  id: number;
  project: number;
  media_type: string;
  s3_key: string;
  sha256: string;
  width: number | null;
  height: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface TaskTypeRecord {
  id: number;
  slug: string;
  name: string;
  description: string;
}

export interface TaskDefinitionRecord<TDefinition extends object> {
  id: number;
  task_type: number;
  version: string;
  definition: TDefinition;
  created_at: string;
}

export interface PluginManifestRecord {
  name: string;
  task_type: string;
  version: string;
  root: string;
  css: string[];
  js: string[];
  result_schema_version: string;
}

export interface TaskBundle<TDefinition extends object = Record<string, unknown>> {
  task: TaskRecord;
  asset: AssetRecord;
  asset_url: string | null;
  task_type: TaskTypeRecord;
  task_definition: TaskDefinitionRecord<TDefinition>;
  plugin: PluginManifestRecord | null;
}

export interface ImageMetrics {
  naturalWidth: number;
  naturalHeight: number;
  renderedWidth: number;
  renderedHeight: number;
}

export interface ImagePoint {
  x: number;
  y: number;
}

export interface DisplayPoint {
  x: number;
  y: number;
}

export interface ImageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DisplayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ShortcutHint {
  keyLabel: string;
  description: string;
}

export interface StatusMetaItem {
  label: string;
  value: string;
}

export interface ToastMessage {
  id: string;
  tone: Exclude<FeedbackTone, 'neutral'>;
  title: string;
  message: string;
}
