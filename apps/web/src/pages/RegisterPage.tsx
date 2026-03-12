import { FormEvent, useMemo, useState } from "react";
import { Link, Navigate, NavLink, useNavigate } from "react-router-dom";
import { BrandWordmark } from "../components/BrandWordmark";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiRequest } from "../lib/api";
import { formatCpf, isValidCpf, normalizeCpf } from "../lib/cpf";

type RegisterStep = "dados" | "verificacao" | "senha";

interface StepItem {
  id: RegisterStep;
  order: number;
  title: string;
}

interface RegisterAvailabilityResponse {
  cpfInUse: boolean;
  emailInUse: boolean;
}

const STEPS: StepItem[] = [
  { id: "dados", order: 1, title: "Dados" },
  { id: "verificacao", order: 2, title: "Código de Verificação" },
  { id: "senha", order: 3, title: "Senha" }
];

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

function formatPhone(value: string): string {
  const digits = normalizePhone(value).slice(0, 11);
  if (digits.length <= 2) {
    return digits;
  }

  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }

  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatBirthDate(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) {
    return digits;
  }

  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function isValidBirthDate(value: string): boolean {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    return false;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return false;
  }

  return date.getTime() < Date.now();
}

function isValidPhone(value: string): boolean {
  const digits = normalizePhone(value);
  return digits.length === 10 || digits.length === 11;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function extractErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

export function RegisterPage() {
  const { register, user, getToken } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<RegisterStep>("dados");
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const activeStepIndex = STEPS.findIndex((item) => item.id === step);
  const formattedEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  if (user?.emailVerified) {
    return <Navigate to="/dashboard" replace />;
  }

  if (user && !user.emailVerified) {
    return <Navigate to="/verify-email" replace state={{ email: user.email }} />;
  }

  function validateStepDados(): boolean {
    const normalizedName = name.trim();
    const normalizedCpf = cpf.trim();

    if (!normalizedName || !normalizedCpf || !phone.trim() || !formattedEmail || !birthDate.trim()) {
      setError("Preencha todos os campos obrigatórios para avançar.");
      return false;
    }

    if (!isValidCpf(normalizedCpf)) {
      setError("Informe um CPF válido.");
      return false;
    }

    if (!isValidPhone(phone)) {
      setError("Informe um número de telefone válido.");
      return false;
    }

    if (!isValidEmail(formattedEmail)) {
      setError("Informe um e-mail válido.");
      return false;
    }

    if (!isValidBirthDate(birthDate)) {
      setError("Informe uma data de nascimento válida no formato DD/MM/AAAA.");
      return false;
    }

    return true;
  }

  async function validateRegisterAvailability(): Promise<boolean> {
    const normalizedCpf = normalizeCpf(cpf);

    try {
      const availability = await apiRequest<RegisterAvailabilityResponse>("/v1/auth/register-availability", {
        method: "POST",
        body: {
          cpf: normalizedCpf,
          email: formattedEmail
        }
      });

      if (availability.cpfInUse) {
        setError('Já existe uma conta com este CPF. Faça login ou use "Esqueci minha senha".');
        return false;
      }

      if (availability.emailInUse) {
        setError('Já existe uma conta com este e-mail. Faça login ou use "Esqueci minha senha".');
        return false;
      }

      return true;
    } catch (nextError) {
      if (nextError instanceof ApiError) {
        setError(nextError.message);
      } else {
        setError("Não foi possível validar o cadastro agora. Tente novamente.");
      }

      return false;
    }
  }

  async function handleSendVerificationCode() {
    setError(null);
    setInfo(null);

    if (!validateStepDados()) {
      return;
    }

    const isAvailable = await validateRegisterAvailability();
    if (!isAvailable) {
      return;
    }

    setSendingCode(true);
    try {
      setStep("verificacao");
      setInfo(`Código de verificação enviado para ${formattedEmail}.`);
    } finally {
      setSendingCode(false);
    }
  }

  async function handleResendCode() {
    setError(null);
    setSendingCode(true);
    try {
      setInfo(`Novo código de verificação enviado para ${formattedEmail}.`);
    } finally {
      setSendingCode(false);
    }
  }

  async function handleCreateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);

    if (!validateStepDados()) {
      setStep("dados");
      return;
    }

    const isAvailable = await validateRegisterAvailability();
    if (!isAvailable) {
      setStep("dados");
      return;
    }

    if (!password || !confirmPassword) {
      setError("Preencha senha e confirmação de senha.");
      return;
    }

    if (password.length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("As senhas não conferem. Revise os campos e tente novamente.");
      return;
    }

    setSubmitting(true);
    try {
      const normalizedName = name.trim();
      const normalizedCpf = normalizeCpf(cpf);

      await register(normalizedName, formattedEmail, password);
      const token = await getToken();

      await apiRequest("/v1/users/profile", {
        method: "POST",
        token,
        body: {
          cpf: normalizedCpf,
          name: normalizedName
        }
      });

      navigate("/verify-email", {
        replace: true,
        state: {
          email: formattedEmail
        }
      });
    } catch (nextError) {
      const errorCode = extractErrorCode(nextError);
      if (errorCode === "auth/email-already-in-use") {
        setError('Já existe uma conta com este e-mail. Faça login ou use "Esqueci minha senha".');
        setStep("dados");
        return;
      }

      if (nextError instanceof ApiError) {
        setError(nextError.message);
      } else if (nextError instanceof Error) {
        setError(nextError.message);
      } else {
        setError("Não foi possível criar a conta agora. Tente novamente.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-flow-shell">
      <header className="public-topbar auth-flow-topbar">
        <div className="public-topbar-inner auth-flow-topbar-inner">
          <NavLink to="/" className="brand-link brand-link--public" aria-label="DoutorEu">
            <BrandWordmark className="brand-wordmark--public" />
          </NavLink>
        </div>
      </header>

      <main className="auth-flow-main">
        <section className="auth-flow-stage">
          <ol className="auth-flow-steps" aria-label="Etapas do cadastro">
            {STEPS.map((item, index) => {
              const isDone = index < activeStepIndex;
              const isActive = item.id === step;
              const className = isActive
                ? "auth-flow-step auth-flow-step--active"
                : isDone
                  ? "auth-flow-step auth-flow-step--done"
                  : "auth-flow-step";

              return (
                <li key={item.id} className={className}>
                  <span>{item.order}º</span>
                  <strong>{item.title}</strong>
                </li>
              );
            })}
          </ol>

          <div className="auth-flow-grid">
            <aside className="auth-flow-cta-card">
              <img
                src="/images/Langing.png"
                alt="Ilustração da plataforma DoutorEu"
                loading="lazy"
              />
              <div className="auth-flow-cta-text">
                <h2>Abra seu caso com clareza e acompanhamento.</h2>
                <p>Preencha seus dados, confirme o e-mail e finalize sua senha em poucos passos.</p>
              </div>
            </aside>

            <section className="auth-flow-form-card">
              <h1>Criar conta</h1>
              <p className="auth-flow-subtitle">Cadastro gratuito para acessar a plataforma DoutorEu.</p>

              <form className="form-grid" onSubmit={handleCreateAccount}>
                {step === "dados" && (
                  <>
                    <div className="auth-flow-fields auth-flow-fields--two">
                      <label>
                        Nome completo
                        <input
                          type="text"
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          required
                          autoComplete="name"
                        />
                      </label>

                      <label>
                        CPF
                        <input
                          type="text"
                          value={cpf}
                          onChange={(event) => setCpf(formatCpf(event.target.value))}
                          placeholder="000.000.000-00"
                          inputMode="numeric"
                          required
                        />
                      </label>

                      <label>
                        Número de telefone
                        <input
                          type="text"
                          value={phone}
                          onChange={(event) => setPhone(formatPhone(event.target.value))}
                          placeholder="(00) 00000-0000"
                          inputMode="numeric"
                          required
                        />
                      </label>

                      <label>
                        E-mail
                        <input
                          type="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          autoComplete="email"
                          required
                        />
                      </label>

                      <label>
                        Data de nascimento
                        <input
                          type="text"
                          value={birthDate}
                          onChange={(event) => setBirthDate(formatBirthDate(event.target.value))}
                          placeholder="DD/MM/AAAA"
                          inputMode="numeric"
                          required
                        />
                      </label>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleSendVerificationCode()}
                      disabled={sendingCode}
                    >
                      {sendingCode ? "Enviando..." : "Enviar código de verificação por e-mail"}
                    </button>
                  </>
                )}

                {step === "verificacao" && (
                  <>
                    <div className="auth-status">
                      <p>
                        Código enviado para <strong>{formattedEmail || "seu e-mail"}</strong>.
                      </p>
                      <p>Confira sua caixa de entrada para seguir com o cadastro.</p>
                    </div>

                    <div className="auth-actions auth-actions--compact">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => void handleResendCode()}
                        disabled={sendingCode}
                      >
                        {sendingCode ? "Reenviando..." : "Reenviar código"}
                      </button>
                      <button type="button" onClick={() => setStep("senha")}>
                        Continuar
                      </button>
                    </div>
                  </>
                )}

                {step === "senha" && (
                  <>
                    <div className="auth-flow-fields">
                      <label>
                        Crie sua senha
                        <input
                          type="password"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          minLength={6}
                          autoComplete="new-password"
                          required
                        />
                      </label>

                      <label>
                        Confirme a senha
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(event) => setConfirmPassword(event.target.value)}
                          minLength={6}
                          autoComplete="new-password"
                          required
                        />
                      </label>
                    </div>

                    <button type="submit" disabled={submitting}>
                      {submitting ? "Criando conta..." : "Finalizar cadastro"}
                    </button>
                  </>
                )}

                {error && <p className="error-text">{error}</p>}
                {info && <p className="auth-feedback">{info}</p>}
              </form>

              <div className="auth-flow-footer">
                <p>
                  Já possui conta? <Link to="/login">Acesse aqui</Link>
                </p>
                {step !== "dados" && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setStep(step === "senha" ? "verificacao" : "dados")}
                  >
                    Voltar etapa
                  </button>
                )}
              </div>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
