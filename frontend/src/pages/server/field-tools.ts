import { useCallback, useEffect, useState } from 'react';
import { TELEMETRY_ERROR, type Telemetry } from '@/lib/summons-api';

export type LocationState =
  | { status: 'locating'; point: null }
  | { status: 'ready'; point: Telemetry }
  | { status: 'error'; point: null };

/** Watches the device location with high accuracy so the screen can show a live accuracy indicator. */
export function useLiveLocation(): LocationState & { restart: () => void } {
  const [state, setState] = useState<LocationState>(() =>
    'geolocation' in navigator
      ? { status: 'locating', point: null }
      : { status: 'error', point: null },
  );
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) =>
        setState({
          status: 'ready',
          point: {
            latitude: Number(p.coords.latitude.toFixed(6)),
            longitude: Number(p.coords.longitude.toFixed(6)),
            accuracyM: Math.round(p.coords.accuracy * 100) / 100,
          },
        }),
      () => setState({ status: 'error', point: null }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [nonce]);

  const restart = useCallback(() => {
    setState({ status: 'locating', point: null });
    setNonce((n) => n + 1);
  }, []);
  return { ...state, restart };
}

/** Checks the latest fix against the policy. Returns the telemetry error text, or null when the fix is good. */
export function telemetryProblem(loc: LocationState, maxAccuracyM: number): string | null {
  if (loc.status !== 'ready' || loc.point.accuracyM > maxAccuracyM) return TELEMETRY_ERROR;
  return null;
}

/** Shrinks a camera photo to at most 1600 px and re-encodes it as JPEG (always a format the server accepts). */
export async function compressPhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    if (blob) return blob;
  } catch {
    // fall through to the original file
  }
  return file;
}
