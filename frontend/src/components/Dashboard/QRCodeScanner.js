import React, { useState } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import SafeScanner from '../Common/SafeScanner';
import axios from '../../axiosConfig';
import { showToast } from '../../toastService';
import ScanModal from '../Layout/ScanModal';
import { displayBillType } from '../../utils/billTypes';
import { formatMeterNumber } from '../../utils/numberFormat';

const QRCodeScanner = ({ embedded = false, onClose } = {}) => {
  const navigate = useNavigate();
  const [showScanner, setShowScanner] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [scannedTenant, setScannedTenant] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleScan = async (result) => {
    if (!result) return;
    setScanResult(result[0]?.rawValue || result);
    setShowScanner(false);

    try {
      setLoading(true);
      setError('');

      let qrData = result[0]?.rawValue || result;
      let deviceData;
      try {
        deviceData = JSON.parse(qrData);
      } catch (e) {
        deviceData = { device_id: qrData };
      }

      const response = await axios.post('/api/qr-codes/scan', { qr_data: deviceData });
      if (response.data.device) {
        setDeviceInfo(response.data.device);
        setScannedTenant(null);
        showToast('Device scanned successfully!', 'success');
      } else if (response.data.tenant) {
        setScannedTenant(response.data);
        setDeviceInfo(null);
        showToast('Tenant QR scanned', 'info');
        // Notify any listeners (for example TenantLogin) that a tenant QR was resolved
        try {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('app:qr-resolved', { detail: response.data }));
          }
        } catch (e) {
          // ignore dispatch errors
        }
      } else {
        setDeviceInfo(null);
        setScannedTenant(null);
        showToast('Scanned data processed', 'info');
      }
    } catch (err) {
  console.error('Failed to process scanned QR:', err);
  const msg = 'Failed to process scanned QR code. This might not be a valid device QR code.';
  setError(msg);
  showToast(msg, 'error');
    }
    setLoading(false);
  };

  const handleError = (err) => {
    console.error('QR Scanner error:', err);
    setError('QR Scanner error. Make sure camera permissions are enabled.');
  };

  const updateDeviceReading = async (newReading) => {
    if (!deviceInfo) return;
    try {
      setLoading(true);
      setError('');
  await axios.put(`/api/meter-devices/${deviceInfo.id}`, { ...deviceInfo, current_reading: newReading });
  setDeviceInfo({ ...deviceInfo, current_reading: newReading });
  showToast('Device reading updated successfully!', 'success');
    } catch (err) {
      console.error('Failed to update device reading:', err);
      setError('Failed to update device reading');
    }
    setLoading(false);
  };

  return (
  <div className="container-fluid">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h2 className="m-0">QR Code Scanner</h2>
        {embedded ? (
          <div className="d-flex align-items-center">
            {/* Top-right X close button for embedded mode */}
            <button className="btn btn-light btn-sm me-2" style={{ fontSize: 18, lineHeight: 1 }} onClick={() => onClose && onClose()} aria-label="Close">✖</button>
          </div>
        ) : null}
      </div>

      {error && <div className="alert alert-danger mb-3">{error}</div>}

      <div className="card">
        <div className="card-header d-flex justify-content-between align-items-center">
          <span>Scan Meter Device QR Code</span>
          <button className="btn btn-primary btn-sm" onClick={() => setShowScanner(!showScanner)}>
            {showScanner ? 'Close Scanner' : 'Open Scanner'}
          </button>
        </div>
        <div className="card-body">
          {showScanner && (
            <div className="mb-3">
              <div style={{ maxWidth: '300px', margin: '0 auto' }}>
                <SafeScanner onScan={handleScan} onError={handleError} style={{ width: '100%' }} />
              </div>
              <p className="text-center text-muted mt-2">Point your camera at a device QR code to scan</p>
            </div>
          )}

          {/* Removed the plain "Scan Result:" text per user request. When a tenant is scanned we open the ScanModal below */}

          {scannedTenant && (
            <div className="mt-3">
              {/* Show the scan modal when a tenant is scanned. Provide a small action bar so user can Scan Again or open Mark as Paid explicitly. */}
              <div className="d-flex justify-content-end mb-2 gap-2">
                <button className="btn btn-outline-secondary btn-sm" onClick={() => { setShowScanner(true); setScannedTenant(null); }}>Scan Again</button>
                <button className="btn btn-success btn-sm" onClick={() => {/* open ScanModal which contains Mark as Paid */}}>Mark as Paid</button>
              </div>

              <ScanModal open={true} onClose={() => setScannedTenant(null)} tenantPayload={scannedTenant} />
            </div>
          )}

          {deviceInfo && (
            <div className="card mt-3">
              <div className="card-header">Scanned Device Information</div>
              <div className="card-body">
                <div className="row">
                  <div className="col-md-6">
                    <p><strong>Device ID:</strong> {deviceInfo.device_id}</p>
                    <p><strong>Type:</strong> {deviceInfo.type}</p>
                    <p><strong>Apartment:</strong> {deviceInfo.apartment_number || 'Not assigned'}</p>
                  </div>
                  <div className="col-md-6">
                    <p><strong>Current Reading:</strong> {formatMeterNumber(deviceInfo.current_reading)}</p>
                    <p><strong>Last Updated:</strong> {new Date(deviceInfo.last_updated).toLocaleString()}</p>
                  </div>
                </div>

                <div className="mt-3">
                  <h6>Update Device Reading</h6>
                  <div className="input-group">
                    <input type="number" className="form-control" placeholder="New reading value" onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        updateDeviceReading(e.target.value);
                        e.target.value = '';
                      }
                    }} />
                    <button className="btn btn-success" onClick={(e) => {
                      const input = e.target.previousElementSibling;
                      updateDeviceReading(input.value);
                      input.value = '';
                    }} disabled={loading}>{loading ? 'Updating...' : 'Update'}</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!showScanner && !scannedTenant && !deviceInfo && (
            <p className="text-muted text-center">Click "Open Scanner" to start scanning QR codes with your camera</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default QRCodeScanner;
