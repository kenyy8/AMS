import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import '../../theme.css';
import { showToast } from '../../toastService';

const navItems = [
	{ to: '/property-manager-dashboard', label: 'Dashboard' },
	{ to: '/tenant-management', label: 'Tenants' },
	{ to: '/bill-management', label: 'Bills' },
	{ to: '/apartment-management', label: 'Apartments' },
	{ to: '/meter-device-management', label: 'Meter' },
	{ to: '/qr-code-generator', label: 'QR Codes' },
	{ to: '/reports', label: 'Reports' },

];

const Navbar = () => {
	const navigate = useNavigate();
	const location = useLocation();

	// Previously we returned null when a `tenant` key existed in localStorage.
	// That caused the manager navbar to disappear when the app was opened offline
	// and a stale `tenant` key was present. Instead, only hide the manager navbar
	// when a tenant is present AND the current route is a tenant page.
	// Always render the manager navbar. Do not hide it based solely on
	// localStorage or route. Tenant-specific UI should be controlled inside
	// tenant components. This prevents the navbar from disappearing when
	// the app is loaded offline with stale localStorage values.

	const doLogout = () => {
		localStorage.removeItem('token');
		localStorage.removeItem('user');
		navigate('/property-manager-login');
	};

	return (
		<header className="app-header navbar-gradient">
			<div className="container d-flex align-items-center justify-content-between">

				<div className="nav-left d-flex align-items-center gap-3">
					<div className="brand-mark">
						<svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
						  <defs>
							<linearGradient id="hexGrad" x1="0%" y1="0%" x2="100%" y2="100%">
							  <stop offset="0%" stopColor="#6ee7b7" />
							  <stop offset="50%" stopColor="#60a5fa" />
							  <stop offset="100%" stopColor="#7c3aed" />
							</linearGradient>
						  </defs>
						  <path d="M12 2l8.485 4.243v8.514L12 22l-8.485-6.243V6.243L12 2z" fill="url(#hexGrad)" />
						</svg>
					</div>
					<div className="brand-text">SMART APARTMENT</div>
				</div>

				<nav className="nav-center d-none d-md-flex align-items-center gap-2">
					{navItems.map(item => (
						<NavLink
							key={item.to}
							to={item.to}
							className={({ isActive }) => `nav-pill ${isActive ? 'active' : ''}`}
						>
							{item.label}
						</NavLink>
					))}
				</nav>

				<div className="nav-right d-none d-md-flex align-items-center gap-2">
					<button className="nav-utility" title="Refresh" onClick={() => window.location.reload()}>Refresh</button>
					{/* Scan removed from global navbar - scan control moved to Dashboard only */}
					<button className="nav-utility" title="Logout" onClick={doLogout}>Logout</button>
				</div>

				<div className="d-md-none">
					<NavLink to="/property-manager-dashboard" className="nav-pill small">Menu</NavLink>
				</div>
			</div>
		</header>
	);
};

export default Navbar;
