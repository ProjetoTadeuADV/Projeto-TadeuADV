function sanitizeDownloadName(fileName: string | null | undefined): string {
  const fallback = "anexo";
  if (!fileName) {
    return fallback;
  }

  const cleaned = fileName
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ");

  return cleaned.length > 0 ? cleaned : fallback;
}

export function triggerBrowserDownload(blob: Blob, fileName: string | null | undefined): void {
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = sanitizeDownloadName(fileName);
  anchor.rel = "noopener";
  anchor.style.display = "none";

  document.body.appendChild(anchor);
  window.requestAnimationFrame(() => {
    anchor.click();
    window.setTimeout(() => {
      window.URL.revokeObjectURL(objectUrl);
      anchor.remove();
    }, 1500);
  });
}

