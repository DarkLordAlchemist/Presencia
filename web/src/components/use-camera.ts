"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// deviceId is optional — omit it for the default camera (kiosk/enroll
// behavior, unchanged). Pass a specific deviceId (from
// navigator.mediaDevices.enumerateDevices()) to bind to one camera among
// several attached to the same machine, e.g. the Security dashboard
// running more than one camera tile at once.
export function useCamera(deviceId?: string) {
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useCallback((node: HTMLVideoElement | null) => {
    videoElRef.current = node;
    if (node && streamRef.current) {
      node.srcObject = streamRef.current;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReady(false);

    const constraints: MediaStreamConstraints = deviceId
      ? { video: { deviceId: { exact: deviceId } }, audio: false }
      : { video: { facingMode: "user" }, audio: false };

    navigator.mediaDevices
      .getUserMedia(constraints)
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoElRef.current) {
          videoElRef.current.srcObject = stream;
        }
        setReady(true);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not access camera."));

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [deviceId]);

  // Stable across renders (useCallback) — callers put it in effect
  // dependency lists, and a new function every render would restart their
  // scan loops and throw away in-flight results.
  // maxWidth downscales the frame (aspect kept), for callers that send many
  // frames a second and don't need full camera resolution.
  const captureFrame = useCallback((maxWidth?: number, quality = 0.9): Promise<Blob | null> => {
    const video = videoElRef.current;
    if (!video || video.videoWidth === 0) return Promise.resolve(null);

    const scale = maxWidth && video.videoWidth > maxWidth ? maxWidth / video.videoWidth : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return Promise.resolve(null);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
    });
  }, []);

  return { videoRef, ready, error, captureFrame };
}
