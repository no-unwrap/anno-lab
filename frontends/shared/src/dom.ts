export const getCsrfToken = (): string | null => {
  const match = document.cookie.match(/(?:^|;)\s*csrftoken=([^;]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
};

const TEXT_ENTRY_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export const isTypingElement = (node: EventTarget | null): boolean => {
  if (!(node instanceof HTMLElement)) {
    return false;
  }

  if (TEXT_ENTRY_TAGS.has(node.tagName)) {
    return true;
  }

  return Boolean(node.closest('[contenteditable="true"]'));
};
