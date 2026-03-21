import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AppHeader from './AppHeader';
import Footer from './Footer';

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
      <main className="flex-1 bg-[#f8f9fa]">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
