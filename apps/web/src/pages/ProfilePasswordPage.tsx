import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PasswordVisibilityIcon } from "../components/PasswordVisibilityIcon";
import { auth } from "../lib/firebase";

function validateStrongPassword(value: string): string | null {
  if (value.length < 8) {
    return "A nova senha precisa ter no mínimo 8 caracteres.";
  }

  if (!/[A-Z]/.test(value)) {
    return "A nova senha precisa ter ao menos 1 letra maiúscula.";
  }

  if (!/[a-z]/.test(value)) {
    return "A nova senha precisa ter ao menos 1 letra minúscula.";
  }

  if (!/\d/.test(value)) {
    return "A nova senha precisa ter ao menos 1 número.";
  }

  if (!/[^A-Za-z0-9]/.test(value)) {
    return "A nova senha precisa ter ao menos 1 caractere especial (ex.: !@#$%).";
  }

  return null;
}

export function ProfilePasswordPage() {
  const navigate = useNavigate();
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordFormError, setPasswordFormError] = useState<string | null>(null);
  const [passwordFormSuccess, setPasswordFormSuccess] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordFormError(null);
    setPasswordFormSuccess(null);

    const currentAuthUser = auth.currentUser;
    if (!currentAuthUser || !currentAuthUser.email) {
      setPasswordFormError("Faça login novamente para alterar sua senha.");
      return;
    }

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      setPasswordFormError("Preencha senha atual, nova senha e confirmação.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordFormError("A confirmação da nova senha não confere.");
      return;
    }

    if (newPassword === currentPassword) {
      setPasswordFormError("A nova senha deve ser diferente da senha atual.");
      return;
    }

    const strongPasswordError = validateStrongPassword(newPassword);
    if (strongPasswordError) {
      setPasswordFormError(strongPasswordError);
      return;
    }

    setChangingPassword(true);
    try {
      const credential = EmailAuthProvider.credential(currentAuthUser.email, currentPassword);
      await reauthenticateWithCredential(currentAuthUser, credential);
      await updatePassword(currentAuthUser, newPassword);

      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmNewPassword(false);
      setPasswordFormSuccess("Senha atualizada com sucesso.");
    } catch (nextError) {
      const code = (nextError as { code?: string })?.code ?? "";
      if (
        code === "auth/wrong-password" ||
        code === "auth/invalid-credential" ||
        code === "auth/invalid-login-credentials"
      ) {
        setPasswordFormError("Senha atual inválida.");
      } else if (code === "auth/requires-recent-login") {
        setPasswordFormError("Por segurança, saia e entre novamente antes de alterar a senha.");
      } else if (code === "auth/too-many-requests") {
        setPasswordFormError("Muitas tentativas. Aguarde alguns minutos e tente novamente.");
      } else {
        setPasswordFormError("Não foi possível alterar sua senha agora. Tente novamente.");
      }
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <section className="page-stack">
      <section className="workspace-hero workspace-hero--simple">
        <div className="workspace-hero-grid">
          <div>
            <p className="hero-kicker">Configurações da conta</p>
            <h1>Alterar senha</h1>
            <p>Atualize sua senha com segurança.</p>
          </div>
        </div>
      </section>

      <section className="workspace-panel">
        <header className="page-header">
          <div>
            <h2>Segurança da conta</h2>
            <p>Altere sua senha quando desejar.</p>
          </div>
        </header>

        <form className="form-grid" onSubmit={handleChangePassword}>
          <label>
            Senha atual
            <div className="password-input">
              <input
                type={showCurrentPassword ? "text" : "password"}
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="password-visibility-button"
                onClick={() => setShowCurrentPassword((current) => !current)}
                aria-label={showCurrentPassword ? "Ocultar senha atual" : "Mostrar senha atual"}
              >
                <PasswordVisibilityIcon />
              </button>
            </div>
          </label>

          <label>
            Nova senha
            <div className="password-input">
              <input
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                minLength={8}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="password-visibility-button"
                onClick={() => setShowNewPassword((current) => !current)}
                aria-label={showNewPassword ? "Ocultar nova senha" : "Mostrar nova senha"}
              >
                <PasswordVisibilityIcon />
              </button>
            </div>
            <span className="field-help">Use 8+ caracteres com maiúscula, minúscula, número e símbolo.</span>
          </label>

          <label>
            Confirmar nova senha
            <div className="password-input">
              <input
                type={showConfirmNewPassword ? "text" : "password"}
                value={confirmNewPassword}
                onChange={(event) => setConfirmNewPassword(event.target.value)}
                minLength={8}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="password-visibility-button"
                onClick={() => setShowConfirmNewPassword((current) => !current)}
                aria-label={showConfirmNewPassword ? "Ocultar confirmação da nova senha" : "Mostrar confirmação da nova senha"}
              >
                <PasswordVisibilityIcon />
              </button>
            </div>
          </label>

          {passwordFormError && <p className="error-text">{passwordFormError}</p>}
          {passwordFormSuccess && <p className="success-text">{passwordFormSuccess}</p>}

          <div className="profile-actions">
            <button type="submit" disabled={changingPassword}>
              {changingPassword ? "Alterando senha..." : "Salvar nova senha"}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => navigate("/settings/profile")}
              disabled={changingPassword}
            >
              Voltar ao perfil
            </button>
          </div>
        </form>
      </section>
    </section>
  );
}
