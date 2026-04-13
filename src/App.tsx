import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

// EST Labor System Imports
import Layout from './components/Layout';
import Login from './pages/Login';
import WeChatCallback from './pages/WeChatCallback';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Employers from './pages/Employers';
import Workers from './pages/Workers';
import Jobs from './pages/Jobs';
import Approvals from './pages/Approvals';
import Settings from './pages/Settings';
import { useAuthStore } from './store/authStore';

// Private Route for EST
const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const token = useAuthStore((state) => state.token);
  return token ? <>{children}</> : <Navigate to="/login" />;
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/wechat/callback" element={<WeChatCallback />} />
        
        <Route path="/" element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="users" element={<Users />} />
          <Route path="employers" element={<Employers />} />
          <Route path="workers" element={<Workers />} />
          <Route path="jobs" element={<Jobs />} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
