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
import Reports from "./components/Dashboard/Reports.js";
import Layout from './components/Layout/Layout';
import { RequireManager, RequireTenant } from './components/Layout/RoleGuard';
import ApiTest from './pages/ApiTest';

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<Home />} />
    <Route path="/property-manager-login" element={<PropertyManagerLogin />} />
    <Route path="/tenant-login" element={<TenantLogin />} />

    {/* Protected app layout with persistent navbar */}
  <Route element={<Layout />}>
    <Route path="/property-manager-dashboard" element={<RequireManager><PropertyManagerDashboard /></RequireManager>} />
    <Route path="/tenant-dashboard" element={<RequireTenant><TenantDashboard /></RequireTenant>} />
    <Route path="/tenant-management" element={<RequireManager><TenantManagement /></RequireManager>} />
    <Route path="/bill-management" element={<RequireManager><BillManagement /></RequireManager>} />
    <Route path="/apartment-management" element={<RequireManager><ApartmentManagement /></RequireManager>} />
  <Route path="/meter-device-management" element={<RequireManager><MeterDeviceManagement /></RequireManager>} />
    <Route path="/qr-code-generator" element={<RequireManager><QRCodeGenerator /></RequireManager>} />
    <Route path="/reports" element={<RequireManager><Reports /></RequireManager>} />
  <Route path="/qr-codes" element={<RequireManager><QRCodeGenerator /></RequireManager>} />
  <Route path="/api-test" element={<ApiTest />} />
  </Route>
  </Routes>
);

export default AppRoutes;
