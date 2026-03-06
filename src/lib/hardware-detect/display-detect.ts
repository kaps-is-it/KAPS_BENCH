export function detectDisplay() {
  const devicePixelRatio = window.devicePixelRatio || 1;

  return {
    width: window.screen.width,
    height: window.screen.height,
    physicalWidth: Math.round(window.screen.width * devicePixelRatio),
    physicalHeight: Math.round(window.screen.height * devicePixelRatio),
    devicePixelRatio,
    colorDepth: window.screen.colorDepth ?? 24,
  };
}
