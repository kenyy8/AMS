import React, { useState } from 'react';
import axios from '../../axiosConfig';
import { useNavigate } from 'react-router-dom';
import './PropertyManagerLogin.css';
import bgImage from '../../AMSBG.jpg';

const PropertyManagerLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
  const res = await axios.post('/api/property-managers/login', { email, password });
  console.log('Property manager login success', res.data);
  localStorage.setItem('token', res.data.token);
  localStorage.setItem('user', JSON.stringify(res.data.user));
  navigate('/property-manager-dashboard');
    } catch (err) {
  console.error('Property manager login error', err);
  setError(err.response?.data?.message || 'Login failed');
    }
  };

  return (
    <div className="pm-login-root">

      <div className="pm-login-container">
        <div className="pm-login-card">
          <div className="pm-login-header">
            <h2>Property Manager Login</h2>
            <button className="pm-link" onClick={() => navigate('/')}>Back to Home</button>
          </div>

          <form className="pm-login-form" onSubmit={handleLogin}>
            <label className="pm-label">Email</label>
            <input
              type="email"
              className="pm-input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="manager@email.com"
              required
            />

            <label className="pm-label">Password</label>
            <input
              type="password"
              className="pm-input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />

            {error && <div className="pm-error">{error}</div>}

            <button className="pm-submit" type="submit">Log In</button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default PropertyManagerLogin;
