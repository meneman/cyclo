export function resize(
  w: number,
  h: number,
  minWidth: number,
  minHeight: number,
  letterbox: boolean,
) {
  if (letterbox) {
    return { width: minWidth, height: minHeight };
  }

  const scaleX = w < minWidth ? minWidth / w : 1;
  const scaleY = h < minHeight ? minHeight / h : 1;
  const scale = scaleX > scaleY ? scaleX : scaleY;
  const width = Math.floor(w * scale);
  const height = Math.floor(h * scale);

  return { width, height };
}
