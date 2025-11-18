import React from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';

const Layout = () => {
  return (
    <div className="app-root-full">
      <Navbar />
      <div className="app-content-scroll">
        <main className="mgr-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
