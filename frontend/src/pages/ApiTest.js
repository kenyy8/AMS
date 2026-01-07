// frontend/src/pages/ApiTest.js
// Simple page to test backend connectivity from laptop/phone.
import React, { useState } from 'react';
import axios from '../axiosConfig';

export default function ApiTest() {
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');

  async function runTest() {
    setStatus('loading');
    setMessage('');
    try {
      const resp = await axios.get('/api/test', { timeout: 5000 });
      setStatus('ok');
      setMessage(JSON.stringify(resp.data));
    } catch (err) {
      setStatus('error');
      setMessage(err?.response?.data?.message || err.message || String(err));
    }
  }

  return (
    <div style={{padding:20}}>
      <h3>API Test</h3>
  <p>Note: set REACT_APP_API_URL in frontend/.env to your laptop IP, e.g. http://192.168.100.30:5000</p>
      <button onClick={runTest} disabled={status === 'loading'}>Test /api/test</button>
      <div style={{marginTop:10}}>
        <strong>Status:</strong> {status}
        <pre style={{whiteSpace:'pre-wrap',background:'#f6f6f6',padding:10}}>{message}</pre>
      </div>
    </div>
  );
}
