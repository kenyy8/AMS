import React, { useEffect } from 'react';
import AppRoutes from './routes';
import { BrowserRouter as Router, useLocation } from 'react-router-dom';
import './App.css';
import bgImage from './AMSBG.jpg';

function RouteWatcher({ children }) {
  // watches location and toggles a body class for auth pages
  const location = useLocation();

  useEffect(() => {
    // set the background image CSS variable (used only for home and login pages)
    document.body.style.setProperty('--ams-bg', `url(${bgImage})`);

    const bgPaths = ['/', '/property-manager-login', '/tenant-login'];
    if (bgPaths.includes(location.pathname)) {
      // show the global AMS background image
      document.body.classList.add('show-ams-bg');
      document.body.classList.add('auth-page');
    } else {
      // hide AMSBG for other pages and use neutral gradient
      document.body.classList.remove('show-ams-bg');
      document.body.classList.remove('auth-page');
    }
  }, [location]);

  return children;
}

function App() {
    return (
      <Router>
        <RouteWatcher>
          <div className="app-root">
            <AppRoutes />
          </div>
        </RouteWatcher>
      </Router>
    );
}

export default App;
