import React from "react";
import { Routes, Route } from "react-router-dom";
import Home from "./components/Home";
import PropertyManagerLogin from "./components/Auth/PropertyManagerLogin";
import TenantLogin from "./components/Auth/TenantLogin";
import PropertyManagerDashboard from "./components/Dashboard/PropertyManagerDashboard";
import TenantDashboard from "./components/Dashboard/TenantDashboard";
import TenantManagement from "./components/Dashboard/TenantManagement";
import BillManagement from "./components/Dashboard/BillManagement";
import ApartmentManagement from "./components/Dashboard/ApartmentManagement";
import MeterDeviceManagement from "./components/Dashboard/MeterDeviceManagement";
import QRCodeGenerator from "./components/Dashboard/QRCodeGenerator";
import QRReader from "./components/Dashboard/QRReader";
import Reports from "./components/Dashboard/NotificationCenter";
import Layout from './components/Layout/Layout';

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<Home />} />
    <Route path="/property-manager-login" element={<PropertyManagerLogin />} />
    <Route path="/tenant-login" element={<TenantLogin />} />

    {/* Protected app layout with persistent navbar */}
    <Route element={<Layout />}>
      <Route path="/property-manager-dashboard" element={<PropertyManagerDashboard />} />
      <Route path="/tenant-dashboard" element={<TenantDashboard />} />
      <Route path="/tenant-management" element={<TenantManagement />} />
      <Route path="/bill-management" element={<BillManagement />} />
      <Route path="/apartment-management" element={<ApartmentManagement />} />
  <Route path="/meter-device-management" element={<MeterDeviceManagement />} />
      <Route path="/qr-code-generator" element={<QRCodeGenerator />} />
  <Route path="/qr-scanner" element={<QRReader />} />
      <Route path="/reports" element={<Reports />} />
  <Route path="/qr-codes" element={<QRCodeGenerator />} />
    </Route>
  </Routes>
);

export default AppRoutes;
