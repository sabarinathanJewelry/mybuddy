// Compress an image file using Canvas before uploading to storage.
// Resizes to maxWidth (default 900px), converts to JPEG at given quality (default 72%).
// A typical 3MB phone photo compresses to ~120-200KB.

export async function compressImage(
  file: File,
  maxWidth = 900,
  quality = 0.72
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxWidth / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Compression failed"))),
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Could not load image")); };
    img.src = objectUrl;
  });
}

// Extract the file path inside a Supabase Storage bucket from its public URL.
// e.g. "https://xxx.supabase.co/storage/v1/object/public/repair-photos/repair-123.jpg"
// → "repair-123.jpg"
export function storagePath(publicUrl: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(publicUrl.slice(idx + marker.length));
}
