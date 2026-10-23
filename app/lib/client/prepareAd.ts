// Runs in the browser. Turns the chosen file into the small set of pictures we send to the server.
// Video: up to 20 frames (one per 3 seconds, so up to 60 seconds), 640 px wide at first and shrunk
// step by step if the upload would pass 4.5 MB. Sound is not sent.
// Image: one picture. Nothing leaves the browser except these pictures.

export const ACCEPT = "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,.mp4,.mov,.jpg,.jpeg,.png,.webp";
export const MAX_VIDEO_SECONDS = 62; // "about 60 seconds", with a little grace
const MAX_FRAMES = 20;
const FRAME_STEP_S = 3;
// Frame size and JPEG quality to try, biggest first. The first fits most videos; the rest shrink
// the frames more only if the whole upload would go over the limit.
const VIDEO_SIZE_STEPS = [
  { width: 640, quality: 0.7 },
  { width: 512, quality: 0.6 },
  { width: 448, quality: 0.5 },
  { width: 384, quality: 0.45 },
  { width: 320, quality: 0.4 },
];
const IMAGE_MAX_WIDTH = 1024;
const MAX_PAYLOAD_CHARS = 4.2 * 1024 * 1024; // the server limit is 4.5 MB for the whole request

export class UserFacingError extends Error {}

export interface PreparedAd {
  kind: "image" | "video";
  frames: { dataUrl: string }[];
  videoDurationS?: number;
  /** Where the video's frames stopped (so the page can say only the start was analysed). */
  analysedS?: number;
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime"];

function kindOf(file: File): "image" | "video" {
  const name = file.name.toLowerCase();
  if (IMAGE_TYPES.includes(file.type) || /\.(jpe?g|png|webp)$/.test(name)) return "image";
  if (VIDEO_TYPES.includes(file.type) || /\.(mp4|mov)$/.test(name)) return "video";
  throw new UserFacingError("This file type is not accepted. Please use a JPEG, PNG or WebP picture, or an MP4 or MOV video.");
}

/** True if a picture has almost no variation (all one colour). */
function isNearBlank(source: CanvasImageSource): boolean {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext("2d");
  if (!ctx) return false;
  ctx.drawImage(source, 0, 0, 32, 32);
  const { data } = ctx.getImageData(0, 0, 32, 32);
  const lum: number[] = [];
  for (let i = 0; i < data.length; i += 4) lum.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
  const sd = Math.sqrt(lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length);
  return sd < 5; // ASSUMED threshold: nearly flat on a 0 to 255 scale
}

function drawScaled(source: CanvasImageSource, w: number, h: number, maxWidth: number, quality: number) {
  const scale = Math.min(1, maxWidth / w);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  const ctx = c.getContext("2d");
  if (!ctx) throw new UserFacingError("This browser could not process the picture.");
  ctx.fillStyle = "#fff"; // so transparent PNGs do not turn black as JPEG
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return { dataUrl: c.toDataURL("image/jpeg", quality), blank: isNearBlank(c) };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new UserFacingError("This picture could not be opened. Is the file damaged?"));
    img.src = url;
  });
}

function once(target: HTMLVideoElement, event: string, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new UserFacingError("The video took too long to read. Try a shorter or smaller video.")), ms);
    target.addEventListener(
      event,
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}

export async function prepareAd(file: File): Promise<PreparedAd> {
  const kind = kindOf(file);
  const url = URL.createObjectURL(file);
  try {
    if (kind === "image") {
      const img = await loadImage(url);
      const { dataUrl, blank } = drawScaled(img, img.naturalWidth, img.naturalHeight, IMAGE_MAX_WIDTH, 0.8);
      if (blank) throw new UserFacingError("This picture looks blank. Please choose an ad that has something in it.");
      if (dataUrl.length > MAX_PAYLOAD_CHARS) throw new UserFacingError("This picture is too large. Please use a smaller one.");
      return { kind, frames: [{ dataUrl }] };
    }

    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    const loaded = once(video, "loadedmetadata", 15000);
    video.addEventListener("error", () => undefined);
    await loaded.catch((e) => {
      throw e instanceof UserFacingError ? e : new UserFacingError("This video could not be opened.");
    });
    if (!video.videoWidth || !isFinite(video.duration)) {
      throw new UserFacingError("This browser could not open the video. Try an MP4 file.");
    }
    if (video.duration > MAX_VIDEO_SECONDS) {
      throw new UserFacingError("This video is longer than about 60 seconds. Please use a shorter one.");
    }
    const count = Math.min(MAX_FRAMES, Math.max(1, Math.ceil(video.duration / FRAME_STEP_S)));
    // Grab each frame once at the starting size, then encode them, shrinking if the total is too big.
    const grabbed: HTMLCanvasElement[] = [];
    let allBlank = true;
    for (let k = 0; k < count; k++) {
      const seeked = once(video, "seeked", 10000);
      video.currentTime = Math.min(k * FRAME_STEP_S, Math.max(0, video.duration - 0.05));
      await seeked;
      const scale = Math.min(1, VIDEO_SIZE_STEPS[0].width / video.videoWidth);
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(video.videoWidth * scale));
      c.height = Math.max(1, Math.round(video.videoHeight * scale));
      c.getContext("2d")?.drawImage(video, 0, 0, c.width, c.height);
      if (!isNearBlank(c)) allBlank = false;
      grabbed.push(c);
    }
    if (allBlank) throw new UserFacingError("This video looks blank. Please choose an ad that has something in it.");

    for (const step of VIDEO_SIZE_STEPS) {
      const frames = grabbed.map((c) => ({ dataUrl: drawScaled(c, c.width, c.height, step.width, step.quality).dataUrl }));
      if (frames.reduce((n, f) => n + f.dataUrl.length, 0) <= MAX_PAYLOAD_CHARS) {
        return { kind, frames, videoDurationS: video.duration, analysedS: count * FRAME_STEP_S };
      }
    }
    throw new UserFacingError("This video is too large to send even after shrinking the frames. Please use a shorter video.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
