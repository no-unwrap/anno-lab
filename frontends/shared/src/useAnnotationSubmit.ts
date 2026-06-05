import { useCallback, useState } from 'react';

import { createSubmissionId } from './boot';
import { getCsrfToken } from './dom';
import { BootConfig, BootMturkConfig, FeedbackState } from './types';

interface SubmitAnnotationOptions {
  result: Record<string, unknown>;
  schemaVersion: string;
  toolVersion: string;
  rawPayload?: Record<string, unknown>;
  assignment?: number | null;
  actor?: string;
  submissionId?: string;
  pendingMessage?: string;
  successMessage?: string;
  mturkPendingMessage?: string;
  mturkSuccessMessage?: string;
}

interface UseAnnotationSubmitOptions {
  taskId?: number | string;
  apiBase: string;
  actor: string;
  boot: BootConfig;
}

const INITIAL_FEEDBACK: FeedbackState = {
  tone: 'neutral',
  message: ''
};

interface AnnotationEnvelope {
  task: number | string;
  result: Record<string, unknown>;
  schema_version: string;
  tool_version: string;
  actor: string;
  submission_id: string;
  raw_payload: Record<string, unknown>;
  assignment: number | null;
}

const mergeMturkPayload = (
  rawPayload: Record<string, unknown> | undefined,
  boot: BootConfig
): Record<string, unknown> => {
  const nextPayload = rawPayload ? { ...rawPayload } : {};
  if (!boot.mturk) {
    return nextPayload;
  }

  const existingMturk =
    nextPayload.mturk && typeof nextPayload.mturk === 'object' && !Array.isArray(nextPayload.mturk)
      ? (nextPayload.mturk as Record<string, unknown>)
      : {};

  nextPayload.mturk = {
    ...existingMturk,
    assignmentId: boot.mturk.assignmentId,
    hitId: boot.mturk.hitId,
    workerId: boot.mturk.workerId,
    sandbox: boot.mturk.sandbox
  };
  return nextPayload;
};

const buildAnnotationEnvelope = ({
  taskId,
  result,
  schemaVersion,
  toolVersion,
  rawPayload,
  assignment,
  actor,
  submissionId,
  boot
}: {
  taskId: number | string;
  result: Record<string, unknown>;
  schemaVersion: string;
  toolVersion: string;
  rawPayload: Record<string, unknown> | undefined;
  assignment: number | null;
  actor: string;
  submissionId: string;
  boot: BootConfig;
}): AnnotationEnvelope => ({
  task: taskId,
  result,
  schema_version: schemaVersion,
  tool_version: toolVersion,
  actor,
  submission_id: submissionId,
  raw_payload: mergeMturkPayload(rawPayload, boot),
  assignment
});

const appendHiddenField = (
  form: HTMLFormElement,
  name: string,
  value: string
): void => {
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = name;
  input.value = value;
  form.appendChild(input);
};

const submitAnnotationToMturk = ({
  payload,
  mturk
}: {
  payload: AnnotationEnvelope;
  mturk: BootMturkConfig;
}): void => {
  if (typeof document === 'undefined' || !document.body) {
    throw new Error('MTurk handoff requires a browser document.');
  }
  if (!mturk.assignmentId) {
    throw new Error('Accept the MTurk assignment before submitting.');
  }
  if (!mturk.submitUrl) {
    throw new Error('MTurk submit URL is missing from the boot payload.');
  }

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = mturk.submitUrl;
  form.style.display = 'none';
  appendHiddenField(form, 'assignmentId', mturk.assignmentId);
  appendHiddenField(form, 'annotation', JSON.stringify(payload));
  document.body.appendChild(form);
  form.submit();
};

export const useAnnotationSubmit = ({
  taskId,
  apiBase,
  actor,
  boot
}: UseAnnotationSubmitOptions) => {
  const [feedback, setFeedback] = useState<FeedbackState>(INITIAL_FEEDBACK);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetFeedback = useCallback(() => setFeedback(INITIAL_FEEDBACK), []);

  const submit = useCallback(
    async ({
      result,
      schemaVersion,
      toolVersion,
      rawPayload,
      assignment = null,
      actor: actorOverride,
      submissionId,
      pendingMessage = 'Submitting annotation…',
      successMessage = 'Annotation submitted successfully.',
      mturkPendingMessage = 'Handing annotation back to MTurk…',
      mturkSuccessMessage = 'Annotation handed back to MTurk for ingestion.'
    }: SubmitAnnotationOptions) => {
      if (!taskId) {
        throw new Error('anno-lab boot payload is missing taskId.');
      }

      const useMturkTransport = Boolean(boot.mturk && !boot.writeToken);
      const nextSubmissionId = submissionId ?? boot.submissionId ?? createSubmissionId(toolVersion);
      const resolvedSubmissionId =
        useMturkTransport ? boot.submissionId ?? '' : nextSubmissionId;
      const payload = buildAnnotationEnvelope({
        taskId,
        result,
        schemaVersion,
        toolVersion,
        rawPayload,
        assignment,
        actor: actorOverride ?? actor,
        submissionId: resolvedSubmissionId,
        boot
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      const csrfToken = getCsrfToken();
      if (csrfToken) {
        headers['X-CSRFToken'] = csrfToken;
      }
      if (boot.writeToken) {
        headers['X-Anno-Lab-Write-Token'] = boot.writeToken;
      }

      setIsSubmitting(true);
      setFeedback({
        tone: 'pending',
        label: 'In flight',
        message: useMturkTransport ? mturkPendingMessage : pendingMessage
      });

      try {
        if (useMturkTransport && !resolvedSubmissionId) {
          throw new Error('Accept the MTurk assignment before submitting.');
        }

        if (useMturkTransport && boot.mturk) {
          submitAnnotationToMturk({
            payload,
            mturk: boot.mturk
          });

          setFeedback({
            tone: 'success',
            label: 'Handed off',
            message: mturkSuccessMessage
          });

          return {
            responseStatus: null,
            submissionId: resolvedSubmissionId,
            transport: 'mturk' as const
          };
        }

        const response = await fetch(`${apiBase}/annotations/`, {
          method: 'POST',
          headers,
          credentials: 'same-origin',
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `Annotation request failed (${response.status})`);
        }

        setFeedback({
          tone: 'success',
          label: 'Saved',
          message: successMessage
        });

        return {
          responseStatus: response.status,
          submissionId: resolvedSubmissionId,
          transport: 'api' as const
        };
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : 'Unexpected error while submitting.';
        setFeedback({
          tone: 'danger',
          label: 'Error',
          message
        });
        throw caught;
      } finally {
        setIsSubmitting(false);
      }
    },
    [actor, apiBase, boot, taskId]
  );

  return {
    feedback,
    isSubmitting,
    resetFeedback,
    submit
  };
};
