/** Mirror the live preview only — saved frames stay unflipped for face matching. */
export const MIRROR_CAMERA_PREVIEW = true;

/** Draw the raw camera frame (never horizontally flip — must match Profile registration). */
export function drawFaceFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number
) {
  ctx.drawImage(video, 0, 0, width, height);
}

export function captureFaceDataUrl(canvas: HTMLCanvasElement, quality = 0.92): string {
  return canvas.toDataURL("image/jpeg", quality);
}
