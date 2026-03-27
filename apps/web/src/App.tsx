import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { MasterRoute } from "./components/MasterRoute";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Layout } from "./layout/Layout";
import { PublicLayout } from "./layout/PublicLayout";
import { CaseDetailPage } from "./pages/CaseDetailPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DadosPage } from "./pages/DadosPage";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { MasterDashboardPage } from "./pages/MasterDashboardPage";
import { MasterLoginPage } from "./pages/MasterLoginPage";
import { MessagesPage } from "./pages/MessagesPage";
import { NewCasePage } from "./pages/NewCasePage";
import { Pagina1Page } from "./pages/Pagina1Page";
import { Pagina2Page } from "./pages/Pagina2Page";
import { Pagina3Page } from "./pages/Pagina3Page";
import { ProfileSettingsPage } from "./pages/ProfileSettingsPage";
import { ProfilePasswordPage } from "./pages/ProfilePasswordPage";
import { RegisterPage } from "./pages/RegisterPage";
import { StatementPage } from "./pages/StatementPage";
import { Subpagina1Page } from "./pages/Subpagina1Page";
import { Subpagina2Page } from "./pages/Subpagina2Page";
import { Subpagina3Page } from "./pages/Subpagina3Page";
import { Subpagina4Page } from "./pages/Subpagina4Page";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";

function resolveSignedArea(canAccessAdmin: boolean): string {
  return canAccessAdmin ? "/master/dashboard" : "/dashboard";
}

function PublicOnlyRoute() {
  const { user, loading, canAccessAdmin } = useAuth();

  if (loading) {
    return (
      <div className="screen-center">
        <p>Carregando...</p>
      </div>
    );
  }

  if (user) {
    return <Navigate to={resolveSignedArea(canAccessAdmin)} replace />;
  }

  return <Outlet />;
}

function PublicLandingRoute() {
  const { user, loading, canAccessAdmin } = useAuth();

  if (loading) {
    return (
      <div className="screen-center">
        <p>Carregando...</p>
      </div>
    );
  }

  if (user) {
    return <Navigate to={resolveSignedArea(canAccessAdmin)} replace />;
  }

  return <Outlet />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/verify-email" element={<VerifyEmailPage />} />

        <Route element={<PublicLandingRoute />}>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/como-funciona" element={<Navigate to="/" replace />} />
            <Route path="/vantagens" element={<Navigate to="/" replace />} />
            <Route path="/escopo-inicial" element={<Navigate to="/" replace />} />
          </Route>
        </Route>

        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/master/login" element={<MasterLoginPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/cases/new" element={<NewCasePage />} />
            <Route path="/cases/:id" element={<CaseDetailPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/pagina-1" element={<Pagina1Page />} />
            <Route path="/pagina-2" element={<Pagina2Page />} />
            <Route path="/pagina-3" element={<Pagina3Page />} />
            <Route path="/pagina-1/subpagina-1" element={<Subpagina1Page />} />
            <Route path="/pagina-1/subpagina-2" element={<Subpagina2Page />} />
            <Route path="/pagina-2/subpagina-3" element={<Subpagina3Page />} />
            <Route path="/pagina-2/subpagina-4" element={<Subpagina4Page />} />
            <Route path="/dados" element={<DadosPage />} />
            <Route path="/settings/profile" element={<ProfileSettingsPage />} />
            <Route path="/app/settings/profile" element={<ProfileSettingsPage />} />
            <Route path="/settings/profile/password" element={<ProfilePasswordPage />} />
            <Route path="/app/settings/profile/password" element={<ProfilePasswordPage />} />
            <Route path="/statement" element={<StatementPage />} />
          </Route>
        </Route>

        <Route element={<MasterRoute />}>
          <Route element={<Layout />}>
            <Route path="/master/dashboard" element={<MasterDashboardPage />} />
            <Route path="/administrador" element={<MasterDashboardPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
