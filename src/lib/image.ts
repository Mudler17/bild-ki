/** Bildverarbeitung im Browser: Verkleinern (wie im Original: max. 2000 px, JPEG 80 %) und Zuschneiden. */

const MAX_SIZE = 2000;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Das Bild konnte nicht gelesen werden.'));
    image.src = src;
  });
}

export async function compressImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|gif|heic|heif|avif|bmp)$/i.test(file.name)) {
    throw new Error(`„${file.name}“ ist keine Bilddatei.`);
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    let width = image.naturalWidth;
    let height = image.naturalHeight;
    if (!width || !height) throw new Error(`„${file.name}“ hat keine gültigen Abmessungen.`);
    if (width > height && width > MAX_SIZE) {
      height = Math.round((height * MAX_SIZE) / width);
      width = MAX_SIZE;
    } else if (height >= width && height > MAX_SIZE) {
      width = Math.round((width * MAX_SIZE) / height);
      height = MAX_SIZE;
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas wird von diesem Browser nicht unterstützt.');
    context.fillStyle = '#ffffff'; // Transparenz (PNG) nicht schwarz werden lassen
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Schneidet den in `container` sichtbaren Teil von `image` aus (inkl. Zoom/Verschiebung). */
export function cropVisibleArea(image: HTMLImageElement, container: HTMLElement): string | null {
  const imageRect = image.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  if (!imageRect.width || !imageRect.height) return null;
  const scaleX = image.naturalWidth / imageRect.width;
  const scaleY = image.naturalHeight / imageRect.height;
  const left = Math.max(imageRect.left, containerRect.left);
  const top = Math.max(imageRect.top, containerRect.top);
  const right = Math.min(imageRect.right, containerRect.right);
  const bottom = Math.min(imageRect.bottom, containerRect.bottom);
  const cropWidth = Math.round((right - left) * scaleX);
  const cropHeight = Math.round((bottom - top) * scaleY);
  if (cropWidth <= 1 || cropHeight <= 1) return null;
  const canvas = document.createElement('canvas');
  canvas.width = cropWidth;
  canvas.height = cropHeight;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(
    image,
    Math.round((left - imageRect.left) * scaleX),
    Math.round((top - imageRect.top) * scaleY),
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight,
  );
  return canvas.toDataURL('image/jpeg', 0.92);
}

/** Ungefähre Größe eines Data-URLs in Bytes. */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  return comma < 0 ? 0 : Math.floor(((dataUrl.length - comma - 1) * 3) / 4);
}
