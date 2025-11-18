import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import TenantScanner from '../Dashboard/TenantScanner';

const QuickScannerModal = ({ open, onClose }) => {
	// Hooks must be called unconditionally; effect will be a no-op when not open or SSR.
	useEffect(() => {
		if (!open || typeof document === 'undefined') return;
		const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
		const prevOverflow = document.body.style.overflow;
		document.addEventListener('keydown', handleKey);
		document.body.style.overflow = 'hidden';

		return () => {
			document.removeEventListener('keydown', handleKey);
			document.body.style.overflow = prevOverflow || '';
		};
	}, [open, onClose]);

	if (!open) return null;

	// guard in case document is undefined (SSR)
	if (typeof document === 'undefined') {
		return (
			<div style={{ position: 'fixed', left: 0, right: 0, top: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
				<div style={{ width: 'min(720px, 96%)', background: '#fff', borderRadius: 12, padding: 16 }}>
					<div style={{ display: 'flex', justifyContent: 'flex-end' }}>
						<button className="btn btn-outline-secondary" onClick={onClose}>Close</button>
					</div>
					<TenantScanner onClose={onClose} />
				</div>
			</div>
		);
	}

	const modal = (
		<div style={{ position: 'fixed', left: 0, right: 0, top: 0, bottom: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
			<div style={{ width: 'min(720px, 96%)', maxHeight: '90vh', overflow: 'hidden', background: '#fff', borderRadius: 12, padding: 12, boxShadow: '0 12px 40px rgba(2,6,23,0.3)', display: 'flex', flexDirection: 'column' }}>
				<div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
					<button className="btn btn-outline-secondary" onClick={onClose}>Close</button>
				</div>
				<div style={{ flex: 1, overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
					{/* TenantScanner will be constrained to modal dimensions */}
					<TenantScanner onClose={onClose} />
				</div>
			</div>
		</div>
	);

	return ReactDOM.createPortal(modal, document.body);
};

export default QuickScannerModal;
