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
import { useAuthStore } from './store/authStore';
import { canAccessPath } from './utils/authRole';

// Private Route for EST
const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const token = useAuthStore((state) => state.token);
  const roleKey = useAuthStore((state) => state.user?.role_key || '');
  if (!token) return <Navigate to="/login" />;
  if (!canAccessPath(location.pathname, roleKey)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        
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
