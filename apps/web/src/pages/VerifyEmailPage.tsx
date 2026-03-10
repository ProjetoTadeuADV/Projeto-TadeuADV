import { useState } from "react";
import { FirebaseError } from "firebase/app";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AuthBackLink } from "../components/AuthBackLink";
import { useAuth } from "../context/AuthContext";

type VerifyEmailState = {
  email?: string | null;
  from?: {
    pathname?: string;
  };
} | null;

function formatFirebaseError(error: unknown) {
  if (error instanceof FirebaseError) {
    return `Não foi possível reenviar agora (${error.code}).`;
  }

  return "Não foi possível reenviar agora. Tente novamente em instantes.";
}

export function VerifyEmailPage() {
  const { user, loading, logout, refreshUser, resendVerificationEmail } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as VerifyEmailState;
  const emailFromQuery = new URLSearchParams(location.search).get("email");
  const email = user?.email ?? state?.email ?? emailFromQuery ?? "";
  const target = state?.from?.pathname ?? "/dashboard";
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);

  if (loading) {
    return (
      <div className="screen-center">
        <p>Carregando...</p>
      </div>
    );
  }

  if (user?.emailVerified) {
    return <Navigate to={target} replace />;
  }

  async function handleResend() {
    setError(null);
    setStatus(null);

    if (!user) {
      setError("Entre novamente para reenviar o e-mail de verificação.");
      return;
    }

    setResending(true);
    try {
      await resendVerificationEmail();
      setStatus("Solicitamos um novo e-mail de verificação. Confira sua caixa de entrada.");
    } catch (nextError) {
      setError(formatFirebaseError(nextError));
    } finally {
      setResending(false);
    }
  }

  async function handleCheck() {
    setError(null);
    setStatus(null);

    if (!user) {
      navigate("/login", { replace: true });
      return;
    }

    setChecking(true);
    try {
      const refreshedUser = await refreshUser();
      if (refreshedUser?.emailVerified) {
        navigate(target, { replace: true });
        return;
      }

      setStatus("A confirmação ainda não apareceu. Abra o link do e-mail e tente novamente.");
    } catch {
      setError("Não foi possível validar a confirmação agora.");
    } finally {
      setChecking(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <section className="auth-page">
      <AuthBackLink />

      <div className="auth-card auth-card--wide">
        <h1>Verifique seu e-mail</h1>
        <p>
          Sua conta precisa ser confirmada para liberar o acesso ao painel em{" "}
          <strong>{email || "seu e-mail cadastrado"}</strong>.
        </p>

        <div className="auth-status">
          <p>
            Clique em <strong>Reenviar e-mail</strong>, abra o link recebido e depois volte aqui
            para usar <strong>Já confirmei meu e-mail</strong>.
          </p>
        </div>

        {status && <p className="auth-feedback">{status}</p>}
        {error && <p className="error-text">{error}</p>}

        <div className="auth-actions">
          <button type="button" onClick={handleCheck} disabled={checking}>
            {checking ? "Conferindo..." : "Já confirmei meu e-mail"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={handleResend}
            disabled={resending}
          >
            {resending ? "Reenviando..." : "Reenviar e-mail"}
          </button>
        </div>

        <div className="auth-actions auth-actions--links">
          <button type="button" className="ghost-button" onClick={handleLogout}>
            Sair desta conta
          </button>
          <Link to="/login" className="helper-link">
            Voltar para login
          </Link>
        </div>
      </div>
    </section>
  );
}
