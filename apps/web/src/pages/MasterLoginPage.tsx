import { FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { AuthBackLink } from "../components/AuthBackLink";
import { useAuth } from "../context/AuthContext";

export function MasterLoginPage() {
  const { login, user, refreshUser, refreshAccessProfile, logout, canAccessAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user?.emailVerified && canAccessAdmin) {
    return <Navigate to="/master/dashboard" replace />;
  }

  if (user?.emailVerified) {
    return <Navigate to="/dashboard" replace />;
  }

  if (user && !user.emailVerified) {
    return <Navigate to="/verify-email" replace state={{ email: user.email }} />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login(email, password);
      const nextUser = await refreshUser();

      if (nextUser && !nextUser.emailVerified) {
        navigate("/verify-email", {
          replace: true,
          state: {
            email: nextUser.email,
            from: location.state?.from
          }
        });
        return;
      }

      const access = await refreshAccessProfile();
      if (!access?.canAccessAdmin) {
        await logout();
        setError("Esta conta ainda não possui acesso administrativo.");
        return;
      }

      const target = location.state?.from?.pathname ?? "/master/dashboard";
      navigate(target, { replace: true });
    } catch {
      setError("Falha no login master. Verifique e-mail e senha.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="auth-page">
      <AuthBackLink />

      <div className="auth-card auth-card--wide">
        <h1>Entrar como master</h1>
        <p>Use a conta administrativa para acompanhar usuários, cadastros e uso geral da plataforma.</p>

        <form onSubmit={handleSubmit} className="form-grid">
          <label>
            <span className="required-label">
              E-mail master <span className="required-indicator" aria-hidden="true">*</span>
            </span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
            />
          </label>

          <label>
            <span className="required-label">
              Senha <span className="required-indicator" aria-hidden="true">*</span>
            </span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
            />
          </label>

          {error && <p className="error-text">{error}</p>}

          <button type="submit" disabled={submitting}>
            {submitting ? "Entrando..." : "Entrar como master"}
          </button>
        </form>

        <p className="helper-text">Uma conta master pode conceder o mesmo acesso a outras contas pelo painel.</p>
      </div>
    </section>
  );
}
