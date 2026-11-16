import React, { useEffect, useState } from 'react';
import axios from '../../axiosConfig';
import { useNavigate } from 'react-router-dom';
import './PropertyManagerLogin.css';

const PropertyManagerLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [name, setName] = useState('');
  useEffect(() => {
    axios.get('/api/setup/status').then(res => setNeedsSetup(Boolean(res.data.needs_setup))).catch(() => {});
  }, []);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
  const res = await axios.post(needsSetup ? '/api/setup/manager' : '/api/property-managers/login', { name, email, password });
  localStorage.removeItem('tenant');
  localStorage.setItem('token', res.data.token);
  localStorage.setItem('user', JSON.stringify(res.data.user));
  navigate('/property-manager-dashboard');
    } catch (err) {
  if (process.env.NODE_ENV !== 'production') console.error('Property manager login failed');
  setError(err.response?.data?.message || 'Login failed');
    }
  };

  return (
    <div className="pm-login-root">

      <div className="pm-login-container">
        <div className="pm-login-card">
          <div className="pm-login-header">
            <h2>{needsSetup ? 'Set Up Your Property Manager' : 'Property Manager Login'}</h2>
            <button className="pm-link" onClick={() => navigate('/')}>Back to Home</button>
          </div>

          <form className="pm-login-form" onSubmit={handleLogin}>
            {needsSetup && <><label className="pm-label">Name</label><input className="pm-input" value={name} onChange={e => setName(e.target.value)} required /><p>Create your local account with a password of at least 12 characters.</p></>}
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
              minLength={needsSetup ? 12 : undefined}
              onChange={e => setPassword(e.target.value)}
              required
            />

            {error && <div className="pm-error">{error}</div>}

            <button className="pm-submit" type="submit">{needsSetup ? 'Create Account' : 'Log In'}</button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default PropertyManagerLogin;
