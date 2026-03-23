import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function MasterRoute() {
  const { user, loading, canAccessAdmin } = useAuth();
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

  if (!canAccessAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
