// Shrink photos/screenshots before upload (≈1600px is plenty for reading a ticket, and much cheaper for AI).
// PDFs and small images are uploaded as they are.

export async function prepareUpload(file, maxSide = 1600) {
  if (file.type === "application/pdf") return { blob: file, contentType: "application/pdf", ext: "pdf" };
  if (!/^image\//.test(file.type)) throw new Error("אפשר להעלות PDF או תמונה בלבד.");
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("לא הצלחנו לקרוא את התמונה. נסו צילום מסך או PDF.");
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && /^image\/(jpeg|png|webp)$/.test(file.type) && file.size < 4_000_000) {
    return { blob: file, contentType: file.type, ext: file.type.split("/")[1].replace("jpeg", "jpg") };
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  return { blob, contentType: "image/jpeg", ext: "jpg" };
}
