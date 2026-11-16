// src/services/authService.js
// Env-aware Axios login helper compatible with Create-React-App (REACT_APP_*) and Vite (import.meta.env.VITE_*)
// Usage: import { login } from '../services/authService';
//
// .env guidance (frontend/.env):
// - For Create React App, add: REACT_APP_API_URL=http://192.168.100.30:5000
// - For Vite, add: VITE_API_URL=http://192.168.100.30:5000
// - After editing `.env`, restart the dev server (npm start / npm run dev) to pick up changes.
//
// LAN testing: start React dev server and open http://<your-local-ip>:3000 from your phone

import axios from '../axiosConfig';

export async function login(username, password) {
  if (!username || !password) {
    const err = new Error('username and password are required');
    console.error(err);
    throw err;
  }

  try {
    const resp = await axios.post('/api/property-managers/login', { email: username, password });
    return resp.data;
  } catch (error) {
    console.error('login error', error?.response?.data || error.message || error);
    throw error;
  }
}

export default { login };
