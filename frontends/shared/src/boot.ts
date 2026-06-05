import { BootConfig, BootMturkConfig } from './types';

const MTURK_PREVIEW_ASSIGNMENT_ID = 'ASSIGNMENT_ID_NOT_AVAILABLE';

interface BootWindow extends Window {
  __ANNO_LAB_BOOT__?: Record<string, unknown>;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const readTrimmedString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const resolveMturk = (boot: Record<string, unknown>): BootMturkConfig | undefined => {
  const rawMturk = asRecord(boot.mturk);
  if (!Object.keys(rawMturk).length) {
    return undefined;
  }

  return {
    assignmentId: readTrimmedString(rawMturk.assignmentId),
    hitId: readTrimmedString(rawMturk.hitId),
    workerId: readTrimmedString(rawMturk.workerId),
    sandbox: Boolean(rawMturk.sandbox),
    submitUrl: readTrimmedString(rawMturk.submitUrl)
  };
};

export const readBootConfig = (): BootConfig => {
  const bootWindow = window as BootWindow;
  const raw = asRecord(bootWindow.__ANNO_LAB_BOOT__);
  const mturk = resolveMturk(raw);
  const taskId = raw.taskId ?? asRecord(raw.task).id ?? raw.task_id ?? undefined;
  const apiBase = readTrimmedString(raw.apiBase) || '/api';
  const actor = mturk?.workerId || readTrimmedString(raw.actor);
  const assignmentId = mturk?.assignmentId ?? '';
  const submissionId =
    assignmentId && assignmentId !== MTURK_PREVIEW_ASSIGNMENT_ID ? assignmentId : undefined;
  const writeToken = readTrimmedString(raw.writeToken);

  return {
    raw,
    taskId:
      typeof taskId === 'string' || typeof taskId === 'number' ? taskId : undefined,
    apiBase,
    actor,
    submissionId,
    mturk,
    writeToken: writeToken || undefined
  };
};

export const createSubmissionId = (prefix = 'anno-lab'): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}`;
};
