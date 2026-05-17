"use client";

import * as React from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";

/**
 * Wraps @zxing/browser to render a live camera preview and call `onDetected`
 * with each scanned text. Dedupes repeated reads of the same code within
 * 2.5s so a passenger holding their ticket in front of the camera doesn't
 * stream identical results.
 */
export function QrScanner({
  onDetected,
  paused = false,
}: {
  onDetected: (text: string) => void;
  paused?: boolean;
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const controlsRef = React.useRef<IScannerControls | null>(null);
  const lastScanRef = React.useRef<{ text: string; at: number }>({
    text: "",
    at: 0,
  });
  const [error, setError] = React.useState<string | null>(null);
  const [starting, setStarting] = React.useState(true);

  React.useEffect(() => {
    if (paused) return;
    let cancelled = false;
    setStarting(true);
    setError(null);

    const reader = new BrowserMultiFormatReader();

    (async () => {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        if (cancelled) return;
        if (devices.length === 0) {
          setError("No camera detected on this device.");
          setStarting(false);
          return;
        }
        // Prefer a back-facing camera on phones; fall back to the first one.
        const back =
          devices.find((d) => /back|environment|rear/i.test(d.label)) ??
          devices[devices.length - 1];

        const controls = await reader.decodeFromVideoDevice(
          back.deviceId,
          videoRef.current!,
          (result) => {
            if (!result) return;
            const text = result.getText();
            const now = Date.now();
            if (
              text === lastScanRef.current.text &&
              now - lastScanRef.current.at < 2500
            ) {
              return;
            }
            lastScanRef.current = { text, at: now };
            onDetected(text);
          },
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setStarting(false);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to access the camera. Grant permission and try again.",
        );
        setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [paused, onDetected]);

  return (
    <div className="space-y-2">
      <div className="relative aspect-square w-full overflow-hidden rounded-md bg-black">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          muted
          playsInline
        />
        {starting && !error ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
            Starting camera…
          </div>
        ) : null}
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4 text-center text-sm text-white">
            {error}
          </div>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Hold the passenger&apos;s QR code in the centre. Multiple scans of the
        same code in quick succession are deduplicated.
      </p>
    </div>
  );
}
