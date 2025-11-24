import React from 'react';
import { useNavigate } from 'react-router-dom';

const Home = () => {
  const navigate = useNavigate();

  return (
    <div className="hero-center">
      <div className="container-narrow">
        <div className="card-glass" style={{ padding: 32 }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 700, letterSpacing: '.08em' }}>SMART APARTMENT</div>
            <h1 style={{ margin: '8px 0 6px', fontSize: 36, lineHeight: 1.08 }}>Smart ID Apartment Monitoring System</h1>
            <p style={{ margin: '0 0 14px', color: '#475569' }}>Smart ID access • Real‑time Meter • Automated Billing</p>
          </div>

          <div className="card-row">
            <div className="card-glass left" style={{ padding: 18, minHeight: 180 }} role="button" onClick={() => navigate('/property-manager-login')}>
              <div className="card-top-bar" />
              <div className="card-left-icon">🏢</div>
              <div className="card-content">
                <h3>Property Manager</h3>
                <div className="muted">Apartments • Tenants • Meter Devices</div>
                <div style={{ marginTop: 12 }}>
                  <button className="btn btn-primary">Manager Login</button>
                </div>
              </div>
              <div className="card-right-illustration">🏠</div>
            </div>

            <div className="card-glass right" style={{ padding: 18, minHeight: 180 }} role="button" onClick={() => navigate('/tenant-login')}>
              <div className="card-top-bar" />
              <div className="card-left-icon">👤</div>
              <div className="card-content">
                <h3>Tenant Portal</h3>
                <div className="muted">View bills • Usage • Payments</div>
                <div style={{ marginTop: 12 }}>
                  <button className="btn btn-success">Tenant Login</button>
                </div>
              </div>
              <div className="card-right-illustration">🏡</div>
            </div>
          </div>

          <div className="features-row">
            <div className="feature-pill">🔳 QR Access</div>
            <div className="feature-pill">📡 Meter Live</div>
            <div className="feature-pill">🧾 Auto Billing</div>
            <div className="feature-pill">📈 Analytics</div>
          </div>

          <div className="site-footer">Privacy Policy &middot; Terms &middot; About Us</div>
        </div>
      </div>
    </div>
  );
};

export default Home;
