import { useCallback, useState } from 'react';

export const useSelectionSync = <T extends string | number>(initialValue: T | null = null) => {
  const [selectedId, setSelectedId] = useState<T | null>(initialValue);

  const clearSelection = useCallback(() => setSelectedId(null), []);
  const select = useCallback((nextId: T | null) => setSelectedId(nextId), []);
  const isSelected = useCallback((candidate: T | null) => selectedId !== null && candidate === selectedId, [selectedId]);

  return {
    selectedId,
    select,
    clearSelection,
    isSelected
  };
};
