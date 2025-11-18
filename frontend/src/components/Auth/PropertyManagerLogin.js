import React, { useState } from 'react';
import axios from '../../axiosConfig';
import { useNavigate } from 'react-router-dom';

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
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      navigate('/property-manager-dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    }
  };

  return (
    <div className="container" style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card">
        <div className="card-body">
          <h2 className="card-title">Property Manager Login</h2>
          <button className="btn btn-link mb-3" onClick={() => navigate('/')}>Back to Home</button>
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">Email:</label>
              <input 
                type="email" 
                className="form-control" 
                value={email}
                onChange={e => setEmail(e.target.value)} 
                placeholder="manager@apartment.com"
                required 
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password:</label>
              <input 
                type="password" 
                className="form-control" 
                value={password}
                onChange={e => setPassword(e.target.value)} 
                required 
              />
            </div>
            {error && <div className="alert alert-danger">{error}</div>}
            <button className="btn btn-primary mt-3" type="submit">Log In</button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default PropertyManagerLogin;
