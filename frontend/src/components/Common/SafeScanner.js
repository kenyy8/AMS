import React, { useEffect, useRef } from 'react';
import jsQR from 'jsqr';

// Decode locally with the already-used jsQR library; no CDN or WASM download.
export default function SafeScanner({ onScan, onError, style }) {
  const video = useRef(null);
  const callbacks = useRef({ onScan, onError });
  callbacks.current = { onScan, onError };
  useEffect(() => {
    let stream, frame, stopped = false, previous = '';
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    function tick() {
      if (stopped) return;
      const element = video.current;
      if (element?.readyState >= 2 && context) {
        canvas.width = Math.min(element.videoWidth, 640);
        canvas.height = Math.round(canvas.width * element.videoHeight / element.videoWidth);
        context.drawImage(element, 0, 0, canvas.width, canvas.height);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const result = jsQR(image.data, image.width, image.height);
        if (result && result.data !== previous) { previous = result.data; callbacks.current.onScan?.([{ rawValue: result.data }]); }
      }
      frame = requestAnimationFrame(tick);
    }
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is unavailable');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (stopped) { stream.getTracks().forEach(track => track.stop()); return; }
        video.current.srcObject = stream;
        await video.current.play();
        frame = requestAnimationFrame(tick);
      } catch (error) { if (!stopped) callbacks.current.onError?.(error); }
    }
    start();
    return () => { stopped = true; cancelAnimationFrame(frame); stream?.getTracks().forEach(track => track.stop()); };
  }, []);
  return <video ref={video} muted playsInline style={{ width: '100%', background: '#000', ...style }} aria-label="Smart ID camera" />;
}
