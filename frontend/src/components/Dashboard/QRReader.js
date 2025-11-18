import React, { useState } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import axios from "../../axiosConfig";
import { showToast } from '../../toastService';

function QRReader() {
  const [data, setData] = useState("No result");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleScan = async (result) => {
    if (result) {
      setData(result);
      setLoading(true);
      setMessage("");

      try {
        // Send the scanned code to backend
  const response = await axios.post("/api/meter-devices/scan", {
          device_id: result,
        });

        if (response.data) {
          setMessage("Device scanned and saved successfully!");
          showToast('Device scanned and saved successfully!', 'success');
        }
      } catch (error) {
        console.error("Error:", error);
        setMessage(
          "Failed to save device scan: " +
            (error.response?.data?.error || error.message)
        );
        showToast('Failed to save device scan.', 'error');
      }
      setLoading(false);
    }
  };

  return (
  <div className="container-fluid">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h2 className="m-0">QR Scanner</h2>
        <button
          className="btn btn-secondary"
          onClick={() => window.history.back()}
        >
          Back
        </button>
      </div>

      <div className="card">
  <div className="card-header">Scan Meter Device QR Code</div>
        <div className="card-body">
          <div style={{ maxWidth: "400px", margin: "0 auto" }}>
            <Scanner
              onDecode={(result) => handleScan(result)}
              onError={(error) => console.log(error?.message)}
              constraints={{ facingMode: "environment" }}
              style={{ width: "100%" }}
            />
          </div>

          <div className="mt-3 text-center">
            <p>
              <strong>Scanned:</strong> {data}
            </p>
            {loading && <p className="text-info">Processing scan...</p>}
            {message && (
              <div
                className={`alert ${
                  message.includes("successfully")
                    ? "alert-success"
                    : "alert-danger"
                }`}
              >
                {message}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default QRReader;
