/**
 * Bridge to the Bhavya Android app (android/app/src/main/java/ai/bhavya/companion/web/NativeBridge.kt).
 * When the child app runs inside it, the glasses camera and Android's voice replace the
 * browser camera and browser speech. In a normal browser this is null and nothing changes.
 */
export interface NativeBridge {
  version(): number;
  speak(text: string, rate: number, volume: number, language: string): void;
  stopSpeaking(): void;
  startCamera(): void;
  stopCamera(): void;
  cameraStatus(): string;
  cameraMessage(): string;
  /** Newest glasses frame as a JPEG data URL, or "" when there is none. */
  captureFrame(): string;
}

declare global {
  interface Window {
    BhavyaNative?: NativeBridge;
  }
}

export const nativeApp: NativeBridge | null =
  typeof window !== 'undefined' && window.BhavyaNative ? window.BhavyaNative : null;

export type GlassesCameraStatus =
  'off' | 'starting' | 'on' | 'permission' | 'unavailable' | 'error';

const MESSAGES: Record<Exclude<GlassesCameraStatus, 'off' | 'starting' | 'on'>, string> = {
  permission: 'The glasses camera needs permission. Ask a grown-up to check Bhavya settings.',
  unavailable: 'The glasses are not connected.',
  error: 'The glasses camera is not working right now.',
};

export function readGlassesCamera(bridge: NativeBridge): {
  status: GlassesCameraStatus;
  message: string | null;
} {
  const raw = bridge.cameraStatus();
  const status: GlassesCameraStatus = (
    ['off', 'starting', 'on', 'permission', 'unavailable', 'error'] as const
  ).includes(raw as GlassesCameraStatus)
    ? (raw as GlassesCameraStatus)
    : 'error';
  if (status === 'off' || status === 'starting' || status === 'on')
    return { status, message: null };
  return { status, message: bridge.cameraMessage() || MESSAGES[status] };
}
