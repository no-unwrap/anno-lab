import { useEffect, useState } from 'react';

import { TaskBundle } from './types';

interface UseTaskBundleOptions {
  taskId?: number | string;
  apiBase: string;
}

export const useTaskBundle = <TDefinition extends object>({
  taskId,
  apiBase
}: UseTaskBundleOptions) => {
  const [bundle, setBundle] = useState<TaskBundle<TDefinition> | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(Boolean(taskId));

  useEffect(() => {
    if (!taskId) {
      setLoading(false);
      setBundle(null);
      return undefined;
    }

    const controller = new AbortController();

    const loadBundle = async () => {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(`${apiBase}/tasks/${taskId}/bundle/`, {
          credentials: 'same-origin',
          signal: controller.signal
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `Task bundle request failed (${response.status})`);
        }

        const nextBundle = (await response.json()) as TaskBundle<TDefinition>;
        setBundle(nextBundle);
      } catch (caught) {
        if (controller.signal.aborted) {
          return;
        }

        setError(caught instanceof Error ? caught.message : 'Unexpected bundle loading error.');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadBundle();
    return () => controller.abort();
  }, [apiBase, taskId]);

  return {
    bundle,
    error,
    loading
  };
};
