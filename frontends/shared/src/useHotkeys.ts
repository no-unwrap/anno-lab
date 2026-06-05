import { RefObject, useEffect } from 'react';

import { isTypingElement } from './dom';

interface UseHotkeysOptions {
  scopeRef: RefObject<HTMLElement | null>;
  onKeyDown: (event: KeyboardEvent) => void;
  enabled?: boolean;
}

export const useHotkeys = ({ scopeRef, onKeyDown, enabled = true }: UseHotkeysOptions): void => {
  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope || !enabled) {
      return undefined;
    }

    const ownerDocument = scope.ownerDocument;
    const handleKeyDown = (event: KeyboardEvent) => {
      const currentScope = scopeRef.current;
      if (!currentScope) {
        return;
      }

      const activeElement = ownerDocument.activeElement;
      const eventTarget = event.target instanceof Node ? event.target : null;
      const inScope =
        Boolean(activeElement && currentScope.contains(activeElement)) ||
        Boolean(eventTarget && currentScope.contains(eventTarget));

      if (!inScope) {
        return;
      }

      if (isTypingElement(activeElement) || isTypingElement(eventTarget)) {
        return;
      }

      onKeyDown(event);
    };

    ownerDocument.addEventListener('keydown', handleKeyDown);
    return () => ownerDocument.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onKeyDown, scopeRef]);
};
