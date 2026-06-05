export const setElementRect = (
  element: Element,
  dimensions: { left?: number; top?: number; width: number; height: number }
): void => {
  const { left = 0, top = 0, width, height } = dimensions;
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => undefined
    })
  });
};

export const installBootConfig = (boot: Record<string, unknown>): void => {
  interface BootWindow extends Window {
    __ANNO_LAB_BOOT__?: Record<string, unknown>;
  }

  (window as BootWindow).__ANNO_LAB_BOOT__ = boot;
};
