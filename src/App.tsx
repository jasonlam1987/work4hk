import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';

// EST Labor System Imports
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Employers from './pages/Employers';
import Workers from './pages/Workers';
import Jobs from './pages/Jobs';
import Approvals from './pages/Approvals';
import QuotaApplications from './pages/QuotaApplications';
import Settings from './pages/Settings';
import DeletionApprovals from './pages/DeletionApprovals';
import Placeholder from './pages/Placeholder';
import FinanceManagement from './pages/FinanceManagement';
import Register from './pages/Register';
import RegisterVerify from './pages/RegisterVerify';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import { useAuthStore } from './store/authStore';
import { canAccessPath } from './utils/authRole';
import { getDevBypassSeed, isDevBypassEnabled } from './utils/devBypass';

const useDevBypassAuth = () => {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const setAuth = useAuthStore((state) => state.setAuth);
  const enabled = isDevBypassEnabled();

  useEffect(() => {
    if (!enabled || token) return;
    const seed = getDevBypassSeed();
    setAuth(seed.user, seed.token);
  }, [enabled, token, setAuth]);

  if (enabled && !token) {
    const seed = getDevBypassSeed();
    return { token: seed.token, roleKey: seed.user.role_key, initializing: true };
  }

  return {
    token,
    roleKey: user?.role_key || '',
    initializing: false,
  };
};

// Private Route for EST
const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const { token, roleKey, initializing } = useDevBypassAuth();
  if (initializing) return null;
  if (!token) return <Navigate to="/login" />;
  if (!canAccessPath(location.pathname, roleKey)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

const LoginRoute = () => {
  const { token, initializing } = useDevBypassAuth();
  if (initializing) return null;
  if (token) return <Navigate to="/dashboard" replace />;
  return <Login />;
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/register" element={<Register />} />
        <Route path="/register/verify" element={<RegisterVerify />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        
        <Route path="/" element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="users" element={<Users />} />
          <Route path="employers" element={<Employers />} />
          <Route path="quota-applications" element={<QuotaApplications />} />
          <Route path="work-visa-applications" element={<Placeholder title="申請工簽" />} />
          <Route path="workers" element={<Workers />} />
          <Route path="jobs" element={<Jobs />} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="finance-management" element={<FinanceManagement />} />
          <Route path="deletion-approvals" element={<DeletionApprovals />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
