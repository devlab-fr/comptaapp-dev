import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AppHeader from './AppHeader';

export default function AppLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader subtitle={user?.email} onSignOut={handleSignOut} />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
