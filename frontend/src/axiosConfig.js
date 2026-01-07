import axios from "axios";

// Set API base URL from env. For LAN testing set REACT_APP_API_URL in frontend/.env to your laptop IP:
// REACT_APP_API_URL=http://192.168.100.30:5000
let baseUrl = process.env.REACT_APP_API_URL || '';
if (!baseUrl && typeof window !== 'undefined') {
  // Fallback: assume backend on same host under port 5000 (useful for LAN testing when you open the frontend via http://<local-ip>:3000)
  baseUrl = window.location.protocol + '//' + window.location.hostname + ':5000';
}

console.info('[axiosConfig] resolved API base URL ->', baseUrl || '(empty)');

const instance = axios.create({ baseURL: baseUrl });

instance.interceptors.response.use(
  response => response,
  error => {
    const path = window.location.pathname || '';
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      if (path.includes('tenant')) {
        window.location.href = '/tenant-login';
      } else {
        window.location.href = '/property-manager-login';
      }
    }
    return Promise.reject(error);
  }
);

export default instance;
