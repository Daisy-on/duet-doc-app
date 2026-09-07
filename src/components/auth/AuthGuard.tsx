import { Loader2 } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

export default function AuthGuard() {
  const location = useLocation();
  const status = useAuthStore((state) => state.status);
  if (status === 'initializing') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bg-main">
        <Loader2 className="animate-spin text-accent" size={28} />
      </div>
    );
  }

  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
