import { sendPasswordResetEmail } from "firebase/auth";
import { FormEvent, useState } from "react";
import { Link, Navigate, NavLink, useLocation, useNavigate } from "react-router-dom";
import { BrandWordmark } from "../components/BrandWordmark";
import { PasswordVisibilityIcon } from "../components/PasswordVisibilityIcon";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiRequest } from "../lib/api";
import { formatCpf, normalizeCpf } from "../lib/cpf";
import { auth } from "../lib/firebase";

interface ResolveLoginResponse {
  email: string;
}

function shouldTreatAsEmailInput(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  return /[A-Za-z@._+-]/.test(trimmed);
}

function normalizeIdentifierForSubmit(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes("@")) {
    return trimmed;
  }

  return normalizeCpf(trimmed);
}

export function LoginPage() {
  const { login, user, refreshAccessProfile, canAccessAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetFeedback, setResetFeedback] = useState<string | null>(null);

  if (user) {
    return <Navigate to={canAccessAdmin ? "/master/dashboard" : "/dashboard"} replace />;
  }

  async function resolveIdentifierToEmail(normalizedIdentifier: string): Promise<string> {
    if (normalizedIdentifier.includes("@")) {
      return normalizedIdentifier.toLowerCase();
    }

    const resolved = await apiRequest<ResolveLoginResponse>("/v1/auth/resolve-login", {
      method: "POST",
      body: {
        identifier: normalizedIdentifier
      }
    });

    return resolved.email;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResetFeedback(null);

    const normalizedIdentifier = normalizeIdentifierForSubmit(identifier);
    if (!normalizedIdentifier || !password) {
      setError("Informe e-mail ou CPF e a senha para entrar.");
      return;
    }

    setSubmitting(true);
    try {
      const resolvedEmail = await resolveIdentifierToEmail(normalizedIdentifier);

      await login(resolvedEmail, password);
      const access = await refreshAccessProfile();
      const target = location.state?.from?.pathname ?? (access?.canAccessAdmin ? "/master/dashboard" : "/dashboard");
      navigate(target, { replace: true });
    } catch (nextError) {
      if (nextError instanceof ApiError && nextError.statusCode === 404) {
        setError("Conta não encontrada para o e-mail ou CPF informado.");
      } else {
        setError("Falha no login. Verifique e-mail/CPF e senha.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgotPassword() {
    setError(null);
    setResetFeedback(null);

    const normalizedIdentifier = normalizeIdentifierForSubmit(identifier);
    if (!normalizedIdentifier) {
      setError("Informe seu e-mail ou CPF para recuperar a senha.");
      return;
    }

    setResettingPassword(true);
    try {
      const resolvedEmail = await resolveIdentifierToEmail(normalizedIdentifier);
      await sendPasswordResetEmail(auth, resolvedEmail);
      setResetFeedback(`Enviamos um link para redefinir a senha em ${resolvedEmail}.`);
    } catch (nextError) {
      if (nextError instanceof ApiError && nextError.statusCode === 404) {
        setError("Conta não encontrada para o e-mail ou CPF informado.");
      } else {
        setError("Não foi possível enviar o link de recuperação agora.");
      }
    } finally {
      setResettingPassword(false);
    }
  }

  return (
    <div className="auth-flow-shell auth-flow-shell--login">
      <header className="public-topbar auth-flow-topbar">
        <div className="public-topbar-inner auth-flow-topbar-inner">
          <NavLink to="/" className="brand-link brand-link--public" aria-label="DoutorEu">
            <BrandWordmark className="brand-wordmark--public" />
          </NavLink>
        </div>
      </header>

      <main className="auth-flow-main">
        <section className="auth-flow-stage auth-flow-stage--single">
          <div className="auth-flow-grid">
            <aside className="auth-flow-cta-card">
              <img
                src="/images/Langing.png"
                alt="Ilustração da plataforma DoutorEu"
                loading="lazy"
              />
              <div className="auth-flow-cta-text">
                <h2>Entre para acompanhar seus casos em tempo real.</h2>
                <p>Acesse com seu e-mail ou CPF e acompanhe tudo em um único painel.</p>
              </div>
            </aside>

            <section className="auth-flow-form-card">
              <h1>Entrar</h1>
              <p className="auth-flow-subtitle">Use seu e-mail ou CPF para acessar sua conta.</p>

              <form onSubmit={handleSubmit} className="form-grid">
                <label>
                  <span className="required-label">
                    E-mail ou CPF <span className="required-indicator" aria-hidden="true">*</span>
                  </span>
                  <input
                    type="text"
                    value={identifier}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (shouldTreatAsEmailInput(value)) {
                        setIdentifier(value);
                        return;
                      }

                      setIdentifier(formatCpf(value));
                    }}
                    required
                    autoComplete="username"
                    placeholder="email@exemplo.com ou 000.000.000-00"
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
                  {submitting ? "Entrando..." : "Acessar conta"}
                </button>
              </form>

              <div className="auth-flow-footer">
                <p>
                  Não possui conta? <Link to="/register">Crie já!</Link>
                </p>
              </div>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
