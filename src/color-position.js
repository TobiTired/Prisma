export function colorPopoverPosition(rect, viewportWidth = window.innerWidth, viewportHeight = window.innerHeight) {
  const width = 222;
  const height = 238;
  const gap = 8;
  const margin = 8;
  const below = viewportHeight - rect.bottom;
  const above = rect.top;
  let top;
  if (below >= height + gap) top = rect.bottom + gap;
  else if (above >= height + gap) top = rect.top - height - gap;
  else top = Math.max(margin, Math.min(rect.bottom + gap, viewportHeight - height - margin));
  const left = Math.max(margin, Math.min(rect.right - width, viewportWidth - width - margin));
  return {
    top,
    left,
    maxWidth: Math.max(100, viewportWidth - margin * 2),
    maxHeight: Math.max(80, viewportHeight - margin * 2),
  };
}
