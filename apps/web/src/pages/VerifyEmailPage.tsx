import { useEffect, useState } from "react";
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

function mapFriendlyEmailError(message: string): string {
  const normalized = message.trim().toLowerCase();

  if (!normalized) {
    return "Nao foi possivel reenviar agora. Tente novamente em instantes.";
  }

  if (normalized.includes("continue url must be a valid url string")) {
    return "Nao foi possivel reenviar o e-mail agora. Verifique o endereco informado e tente novamente.";
  }

  if (
    normalized.includes("user-not-found") ||
    normalized.includes("no user record") ||
    normalized.includes("nao foi encontrado e-mail")
  ) {
    return "Nao foi possivel localizar o e-mail informado.";
  }

  return "Nao foi possivel reenviar o e-mail de verificacao agora. Tente novamente em instantes.";
}

function formatFirebaseError(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return mapFriendlyEmailError(error.message);
  }

  if (error instanceof FirebaseError) {
    if (
      error.code === "auth/user-not-found" ||
      error.code === "auth/invalid-recipient-email" ||
      error.code === "auth/invalid-email"
    ) {
      return "Nao foi possivel localizar o e-mail informado.";
    }

    return `Nao foi possivel reenviar agora (${error.code}).`;
  }

  return "Nao foi possivel reenviar agora. Tente novamente em instantes.";
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
  const [resending, setResending] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    if (!user || user.emailVerified) {
      return;
    }

    let active = true;

    async function syncVerificationStatus() {
      try {
        const refreshedUser = await refreshUser();
        if (!active) {
          return;
        }

        if (refreshedUser?.emailVerified) {
          navigate(target, { replace: true });
        }
      } catch {
        // Ignora falhas transitórias de rede durante a checagem automática.
      }
    }

    void syncVerificationStatus();
    const interval = window.setInterval(() => {
      void syncVerificationStatus();
    }, 5000);
    const onFocus = () => {
      void syncVerificationStatus();
    };
    const onVisibilityChange = () => {
      if (!document.hidden) {
        void syncVerificationStatus();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [navigate, refreshUser, target, user]);

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
      setError("Entre novamente para reenviar o e-mail de verificacao.");
      return;
    }

    setResending(true);
    try {
      await resendVerificationEmail();
      setStatus(
        "Novo link de verificacao enviado. Use sempre o link mais recente e confira tambem spam/lixo eletronico."
      );
    } catch (nextError) {
      setError(formatFirebaseError(nextError));
    } finally {
      setResending(false);
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
      "Deseja excluir sua conta agora? Esta acao remove seu cadastro e os casos vinculados."
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
          : "Nao foi possivel excluir sua conta agora. Tente novamente.";
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
          Abra o link recebido no e-mail. Assim que a confirmacao for concluida, o acesso sera liberado
          automaticamente nesta tela.
        </p>
        <p className="auth-inline-note">Se nao encontrar o e-mail, verifique tambem a pasta de spam.</p>

        {status && <p className="auth-feedback">{status}</p>}
        {error && <p className="error-text">{error}</p>}

        <div className="auth-actions auth-actions--compact">
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
