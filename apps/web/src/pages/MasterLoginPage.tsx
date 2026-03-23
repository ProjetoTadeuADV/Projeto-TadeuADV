import { FormEvent, useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { AuthBackLink } from "../components/AuthBackLink";
import { PasswordVisibilityIcon } from "../components/PasswordVisibilityIcon";
import { useAuth } from "../context/AuthContext";
import { auth } from "../lib/firebase";

export function MasterLoginPage() {
  const { login, user, refreshAccessProfile, logout, canAccessAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetFeedback, setResetFeedback] = useState<string | null>(null);

  if (user && canAccessAdmin) {
    return <Navigate to="/master/dashboard" replace />;
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResetFeedback(null);
    setSubmitting(true);

    try {
      await login(email, password);
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

  async function handleForgotPassword() {
    setError(null);
    setResetFeedback(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Informe o e-mail para recuperar a senha.");
      return;
    }

    setResettingPassword(true);
    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      setResetFeedback(`Enviamos um link para redefinir a senha em ${trimmedEmail}.`);
    } catch {
      setError("Não foi possível enviar o link de recuperação agora.");
    } finally {
      setResettingPassword(false);
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
            <div className="password-input">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                className="password-visibility-button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                <PasswordVisibilityIcon />
              </button>
            </div>
          </label>

          <div className="auth-inline-links">
            <button
              type="button"
              className="text-button"
              onClick={() => void handleForgotPassword()}
              disabled={resettingPassword || submitting}
            >
              {resettingPassword ? "Enviando recuperação..." : "Esqueci a minha senha"}
            </button>
          </div>

          {error && <p className="error-text">{error}</p>}
          {resetFeedback && <p className="success-text">{resetFeedback}</p>}

          <button type="submit" disabled={submitting}>
            {submitting ? "Entrando..." : "Entrar como master"}
          </button>
        </form>

        <p className="helper-text">Uma conta master pode conceder o mesmo acesso a outras contas pelo painel.</p>
      </div>
    </section>
  );
}
