// PNG export at nearest-neighbor integer scales.

export function exportPng(editor, scale) {
  const { size } = editor;
  const out = document.createElement('canvas');
  out.width = size * scale;
  out.height = size * scale;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(editor.art, 0, 0, out.width, out.height);

  out.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pixelpad-${size}x${size}@${scale}x.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}
