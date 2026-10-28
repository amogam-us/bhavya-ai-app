import type { ObjectBox } from '@bhavya/shared';

const FRAME_SIZE = 512;
const JPEG_QUALITY = 0.72;

function drawScaled(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxSize: number,
  crop?: { x: number; y: number; width: number; height: number },
): HTMLCanvasElement {
  const region = crop ?? { x: 0, y: 0, width, height };
  const scale = Math.min(1, maxSize / Math.max(region.width, region.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(region.width * scale));
  canvas.height = Math.max(1, Math.round(region.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is not supported in this browser.');
  context.drawImage(
    source,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas;
}

/** Grabs the current video frame as a small JPEG data URL, or null if no frame is ready. */
export function captureFrame(video: HTMLVideoElement | null, maxSize = FRAME_SIZE): string | null {
  if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) {
    return null;
  }
  return drawScaled(video, video.videoWidth, video.videoHeight, maxSize).toDataURL(
    'image/jpeg',
    JPEG_QUALITY,
  );
}

function waitFor(target: EventTarget, event: string, timeoutMs = 10_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('The video took too long to load.'));
    }, timeoutMs);
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('This video format cannot be read by the browser. Try an MP4 file.'));
    };
    const cleanup = () => {
      clearTimeout(timer);
      target.removeEventListener(event, onEvent);
      target.removeEventListener('error', onError);
    };
    target.addEventListener(event, onEvent, { once: true });
    target.addEventListener('error', onError, { once: true });
  });
}

/**
 * Samples evenly spaced frames from a video file (about one every two
 * seconds, at least `min` and at most `max`) as small JPEG data URLs.
 */
export async function extractVideoFrames(
  file: File,
  options: { min: number; max: number },
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  try {
    await waitFor(video, 'loadeddata');
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('Could not read the length of this video. Try an MP4 file.');
    }
    const count = Math.max(options.min, Math.min(options.max, Math.round(duration / 2)));
    const frames: string[] = [];
    for (let i = 0; i < count; i++) {
      video.currentTime = (duration * (i + 0.5)) / count;
      await waitFor(video, 'seeked');
      const frame = captureFrame(video);
      if (frame) frames.push(frame);
      onProgress?.(i + 1, count);
    }
    if (frames.length < 2) throw new Error('Could not read frames from this video.');
    return frames;
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load the image.'));
    image.src = src;
  });
}

/** Crops a normalized box (plus padding) out of an image, for real-object picture cards. */
export async function cropImage(imageUrl: string, box: ObjectBox, padding = 0.15): Promise<string> {
  const image = await loadImage(imageUrl);
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  const padX = box.width * padding;
  const padY = box.height * padding;
  const left = Math.max(0, box.x - padX) * w;
  const top = Math.max(0, box.y - padY) * h;
  const right = Math.min(1, box.x + box.width + padX) * w;
  const bottom = Math.min(1, box.y + box.height + padY) * h;
  const canvas = drawScaled(image, w, h, 768, {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  });
  return canvas.toDataURL('image/jpeg', 0.9);
}

/** Reads a file as a data URL. */
export function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

const WAV_SAMPLE_RATE = 16_000;

/** Converts any browser-recorded audio (webm, mp4) to 16 kHz mono 16-bit WAV, as Muse Voice expects. */
export async function toWavDataUrl(recording: Blob): Promise<string> {
  const decodeContext = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeContext.decodeAudioData(await recording.arrayBuffer());
  } finally {
    void decodeContext.close();
  }
  const frames = Math.max(1, Math.ceil(decoded.duration * WAV_SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, frames, WAV_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return readFileAsDataUrl(encodeWav(rendered.getChannelData(0), WAV_SAMPLE_RATE));
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

/** Explains why camera or microphone access failed, in plain words. */
export function mediaErrorMessage(error: unknown, device: 'camera' | 'microphone'): string {
  if (!window.isSecureContext) {
    return `The ${device} only works over HTTPS or on localhost. See the README for phone setup.`;
  }
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return `Permission to use the ${device} was denied.`;
    if (error.name === 'NotFoundError') return `No ${device} was found on this device.`;
    if (error.name === 'NotReadableError') return `The ${device} is being used by another app.`;
  }
  return `Could not start the ${device}.`;
}
