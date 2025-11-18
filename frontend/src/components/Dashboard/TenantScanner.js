import React, { useEffect, useState, useRef } from 'react';
import axios from '../../axiosConfig';
import { showToast } from '../../toastService';

const TenantScanner = ({ onClose } = {}) => {
  const [showScanner, setShowScanner] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setShowScanner(true);
  }, []);

  const handleScan = async (result) => {
    if (!result) return;
    const raw = result[0]?.rawValue || result;
    setShowScanner(false);
    setLoading(true);
    setError('');
    try {
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch (e) {
        // backend expects either a string (jwt or id) or an object with device_id/tenant_id
        // send the raw string so the server can parse or coerce it into tenant_id/device_id
        payload = raw;
      }

  console.debug('TenantScanner -> sending qr_data to server:', payload);
  const resp = await axios.post('/api/qr-codes/scan', { qr_data: payload });
      if (resp.data) {
        showToast('QR processed', 'success');
        try {
          if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('app:qr-resolved', { detail: resp.data }));
        } catch (e) {}
      } else {
        showToast('No data returned from scan', 'info');
      }
    } catch (err) {
      console.error('TenantScanner scan error', err);
      setError('Failed to process QR code.');
      showToast('Failed to process QR', 'error');
    }
    setLoading(false);
    if (typeof onClose === 'function') onClose();
  };

  const handleError = (err) => {
    console.error('TenantScanner error', err);
    setError('Scanner error — allow camera permission and try again.');
  };

  // Native BarcodeDetector-based scanner (no external WASM/network)
  const LocalBarcodeScanner = ({ onDetected, onError }) => {
    const videoRef = useRef(null);
    const rafRef = useRef(null);

    useEffect(() => {
      let mounted = true;
      let stream = null;
      const start = async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          if (!mounted) return;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
          }

          // prefer native BarcodeDetector if available
          const Barcode = window.BarcodeDetector || window.BarcodeDetectorPolyfill;
          if (!Barcode) {
            // signal that native detection not available
            onError && onError(new Error('BarcodeDetector not available'));
            return;
          }

          const detector = new Barcode({ formats: ['qr_code'] });

          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');

          const tick = async () => {
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
              // limit canvas size for performance
              const scale = Math.min(640 / w, 480 / h, 1);
              canvas.width = Math.round(w * scale);
              canvas.height = Math.round(h * scale);
              ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

              try {
                const result = await detector.detect(canvas);
                if (result && result.length > 0) {
                  // deliver first result
                  onDetected && onDetected([{ rawValue: result[0].rawValue }]);
                } else {
                  rafRef.current = requestAnimationFrame(tick);
                }
              } catch (e) {
                // detection failure, continue polling
                rafRef.current = requestAnimationFrame(tick);
              }
            } catch (e) {
              onError && onError(e);
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
        if (stream) {
          stream.getTracks().forEach(t => t.stop());
        }
      };
    }, [onDetected, onError]);

    return (
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted playsInline />
      </div>
    );
  };

  // dynamic fallback loader for the shipped Scanner component (only load if native not available)
  const [FallbackScanner, setFallbackScanner] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        // load only when needed (lazy) to avoid module-level runtime wasm fetches
        const mod = await import('@yudiel/react-qr-scanner');
        if (cancelled) return;
        setFallbackScanner(() => mod.Scanner);
      } catch (e) {
        console.warn('Failed to load fallback scanner library', e);
      }
    };
    // do not eagerly load; only load when BarcodeDetector is absent
    if (!('BarcodeDetector' in window)) load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#111' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 380, maxWidth: '92vw' }}>
          {error && <div className="alert alert-danger">{error}</div>}
          <div style={{ background: '#000', padding: 6, borderRadius: 8, overflow: 'hidden' }}>
            {/* make scanner compact: fixed width, automatic height */}
            <div style={{ width: 360, height: 360, maxWidth: '92vw', maxHeight: '60vh' }}>
              {/* Prefer native BarcodeDetector-based scanner for offline/no-wasm environments */}
              {('BarcodeDetector' in window) ? (
                <LocalBarcodeScanner onDetected={handleScan} onError={(e) => { console.error('Local scanner failed', e); setError('Scanner is unavailable'); }} />
              ) : (FallbackScanner ? (
                <FallbackScanner onScan={handleScan} onError={(e) => { console.error('Fallback scanner error', e); setError('Scanner failed'); }} style={{ width: '100%', height: '100%' }} />
              ) : (
                <div style={{ color: '#fff', padding: 16 }}>Scanner initializing... If this message persists, your browser does not support BarcodeDetector and the fallback scanner failed to load.</div>
              ))}
            </div>
          </div>
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <button className="btn btn-light" onClick={() => { if (onClose) onClose(); }}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TenantScanner;
