import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function MasterRoute() {
  const { user, loading, isMasterUser } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="screen-center">
        <p>Carregando sessão...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/master/login" replace state={{ from: location }} />;
  }

  if (!user.emailVerified) {
    return <Navigate to="/verify-email" replace state={{ from: location, email: user.email }} />;
  }

  if (!isMasterUser) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
