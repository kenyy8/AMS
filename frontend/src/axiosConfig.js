import axios from "axios";

const instance = axios.create({
  baseURL: process.env.REACT_APP_API_URL || "http://localhost:5001"
});

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
