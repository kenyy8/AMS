import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

// SafeScanner: Prefer native BarcodeDetector; if not available, dynamically import
// @yudiel/react-qr-scanner as a fallback at runtime so module-level WASM fetches don't occur.
const SafeScanner = ({ onScan, onError, style }) => {
  const [Fallback, setFallback] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!('BarcodeDetector' in window)) {
      import('@yudiel/react-qr-scanner').then(mod => {
        if (!cancelled) setFallback(() => mod.Scanner);
      }).catch(err => {
        console.warn('SafeScanner: failed to load fallback scanner', err);
        onError && onError(err);
      });
    }
    return () => { cancelled = true; };
  }, [onError]);

  // very small wrapper that uses BarcodeDetector if present
  if ('BarcodeDetector' in window) {
    return <BarcodeDetectorScanner onDetected={onScan} onError={onError} style={style} />;
  }

  if (Fallback) {
    return <Fallback onScan={onScan} onError={onError} style={style} />;
  }
  // final fallback: use pure-JS jsQR decoder (canvas based) to avoid wasm/CDN
  return <JSQRScanner onDetected={onScan} onError={onError} style={style} />;
};

const BarcodeDetectorScanner = ({ onDetected, onError, style }) => {
  const videoRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    let stream = null;
    let mounted = true;
    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!mounted) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const tick = async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) {
            rafRef.current = requestAnimationFrame(tick);
            return;
          }
          const w = videoRef.current.videoWidth;
          const h = videoRef.current.videoHeight;
          if (w === 0 || h === 0) {
            rafRef.current = requestAnimationFrame(tick);
            return;
          }
          const scale = Math.min(640 / w, 480 / h, 1);
          canvas.width = Math.round(w * scale);
          canvas.height = Math.round(h * scale);
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

          try {
            const res = await detector.detect(canvas);
            if (res && res.length) {
              onDetected && onDetected([{ rawValue: res[0].rawValue }]);
            } else {
              rafRef.current = requestAnimationFrame(tick);
            }
          } catch (e) {
            rafRef.current = requestAnimationFrame(tick);
          }
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        onError && onError(e);
      }
    };
    start();
    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (videoRef.current) {
        try { videoRef.current.pause(); videoRef.current.srcObject = null; } catch (e) {}
      }
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [onDetected, onError]);

  return <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover', ...style }} muted playsInline />;
};

export default SafeScanner;

const JSQRScanner = ({ onDetected, onError, style }) => {
  const videoRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    let stream = null;
    let mounted = true;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!mounted) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        const tick = () => {
          try {
            if (!videoRef.current || videoRef.current.readyState < 2) {
              rafRef.current = requestAnimationFrame(tick);
              return;
            }
            const w = videoRef.current.videoWidth;
            const h = videoRef.current.videoHeight;
            if (w === 0 || h === 0) {
              rafRef.current = requestAnimationFrame(tick);
              return;
            }
            const scale = Math.min(640 / w, 480 / h, 1);
            canvas.width = Math.round(w * scale);
            canvas.height = Math.round(h * scale);
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code && code.data) {
              onDetected && onDetected([{ rawValue: code.data }]);
            } else {
              rafRef.current = requestAnimationFrame(tick);
            }
          } catch (e) {
            rafRef.current = requestAnimationFrame(tick);
          }
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        onError && onError(e);
      }
    };
    start();

    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (videoRef.current) {
        try { videoRef.current.pause(); videoRef.current.srcObject = null; } catch (e) {}
      }
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [onDetected, onError]);

  return <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover', ...style }} muted playsInline />;
};
