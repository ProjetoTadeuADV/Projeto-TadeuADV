import { useState } from "react";
import { FirebaseError } from "firebase/app";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AuthBackLink } from "../components/AuthBackLink";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../lib/api";

type VerifyEmailState = {
  email?: string | null;
  from?: {
    pathname?: string;
  };
} | null;

function formatFirebaseError(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (error instanceof FirebaseError) {
    return `Não foi possível reenviar agora (${error.code}).`;
  }

  return "Não foi possível reenviar agora. Tente novamente em instantes.";
}

export function VerifyEmailPage() {
  const { user, loading, logout, refreshUser, resendVerificationEmail, deleteCurrentAccount } = useAuth();
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
  const [deletingAccount, setDeletingAccount] = useState(false);

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
      setStatus("Reenvio solicitado. Confira sua caixa de entrada.");
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

      setStatus("A confirmação ainda não apareceu. Abra o link recebido e tente novamente.");
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

  async function handleDeleteAccount() {
    if (deletingAccount) {
      return;
    }

    const confirmed = window.confirm(
      "Deseja excluir sua conta agora? Esta ação remove seu cadastro e os casos vinculados."
    );

    if (!confirmed) {
      return;
    }

    setDeletingAccount(true);
    setError(null);
    setStatus(null);

    try {
      await deleteCurrentAccount();
      navigate("/", { replace: true });
    } catch (nextError) {
      const message =
        nextError instanceof ApiError
          ? nextError.message
          : "Não foi possível excluir sua conta agora. Tente novamente.";
      setError(message);
    } finally {
      setDeletingAccount(false);
    }
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

        <p className="auth-inline-note">
          Reenvie a mensagem, abra o link recebido e depois clique em "Já confirmei meu e-mail".
        </p>

        {status && <p className="auth-feedback">{status}</p>}
        {error && <p className="error-text">{error}</p>}

        <div className="auth-actions auth-actions--compact">
          <button type="button" onClick={handleCheck} disabled={checking || deletingAccount}>
            {checking ? "Conferindo..." : "Já confirmei meu e-mail"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={handleResend}
            disabled={resending || deletingAccount}
          >
            {resending ? "Reenviando..." : "Reenviar e-mail"}
          </button>
        </div>

        <div className="auth-inline-links">
          <button
            type="button"
            className="text-button text-button--danger"
            onClick={handleDeleteAccount}
            disabled={deletingAccount}
          >
            {deletingAccount ? "Excluindo conta..." : "Excluir minha conta"}
          </button>
          <button
            type="button"
            className="text-button"
            onClick={handleLogout}
            disabled={deletingAccount}
          >
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
