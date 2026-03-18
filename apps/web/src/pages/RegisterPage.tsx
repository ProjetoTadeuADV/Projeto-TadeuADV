import { FormEvent, useMemo, useState } from "react";
import { Link, Navigate, NavLink, useNavigate } from "react-router-dom";
import { BrandWordmark } from "../components/BrandWordmark";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiRequest } from "../lib/api";
import { formatCpf, isValidCpf, normalizeCpf } from "../lib/cpf";

type RegisterStep = "dados" | "senha";

interface StepItem {
  id: RegisterStep;
  order: number;
  title: string;
}

interface RegisterAvailabilityResponse {
  cpfInUse: boolean;
  emailInUse: boolean;
}

interface ResolveLoginResponse {
  email: string;
}

const STEPS: StepItem[] = [
  { id: "dados", order: 1, title: "Dados" },
  { id: "senha", order: 2, title: "Senha" }
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
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      try {
        await apiRequest<ResolveLoginResponse>("/v1/auth/resolve-login", {
          method: "POST",
          body: {
            identifier: normalizedCpf
          }
        });

        setError('Já existe uma conta com este CPF. Faça login ou use "Esqueci minha senha".');
        return false;
      } catch (fallbackError) {
        const fallbackNotFound = fallbackError instanceof ApiError && fallbackError.statusCode === 404;
        if (fallbackNotFound) {
          return true;
        }

        if (nextError instanceof ApiError) {
          setError(nextError.message);
        } else {
          setError("Não foi possível validar o cadastro agora. Verifique a integração da API no Vercel.");
        }
      }

      return false;
    }
  }

  async function handleGoToPasswordStep() {
    setError(null);

    if (!validateStepDados()) {
      return;
    }

    const isAvailable = await validateRegisterAvailability();
    if (!isAvailable) {
      return;
    }

    setStep("senha");
  }

  async function handleCreateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

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
                <p>Preencha seus dados, defina sua senha e confirme o e-mail pelo link enviado.</p>
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
                        <span className="required-label">
                          Nome completo <span className="required-indicator" aria-hidden="true">*</span>
                        </span>
                        <input
                          type="text"
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          required
                          autoComplete="name"
                        />
                      </label>

                      <label>
                        <span className="required-label">
                          CPF <span className="required-indicator" aria-hidden="true">*</span>
                        </span>
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
                        <span className="required-label">
                          Número de telefone <span className="required-indicator" aria-hidden="true">*</span>
                        </span>
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
                        <span className="required-label">
                          E-mail <span className="required-indicator" aria-hidden="true">*</span>
                        </span>
                        <input
                          type="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          autoComplete="email"
                          required
                        />
                      </label>

                      <label>
                        <span className="required-label">
                          Data de nascimento <span className="required-indicator" aria-hidden="true">*</span>
                        </span>
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
                      onClick={() => void handleGoToPasswordStep()}
                    >
                      Continuar para senha
                    </button>
                  </>
                )}

                {step === "senha" && (
                  <>
                    <div className="auth-flow-fields">
                      <label>
                        <span className="required-label">
                          Crie sua senha <span className="required-indicator" aria-hidden="true">*</span>
                        </span>
                        <div className="password-input">
                          <input
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            minLength={6}
                            autoComplete="new-password"
                            required
                          />
                          <button
                            type="button"
                            className="password-visibility-button"
                            onClick={() => setShowPassword((current) => !current)}
                            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                          >
                            {showPassword ? "Ocultar" : "Mostrar"}
                          </button>
                        </div>
                      </label>

                      <label>
                        <span className="required-label">
                          Confirme a senha <span className="required-indicator" aria-hidden="true">*</span>
                        </span>
                        <div className="password-input">
                          <input
                            type={showPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            minLength={6}
                            autoComplete="new-password"
                            required
                          />
                          <button
                            type="button"
                            className="password-visibility-button"
                            onClick={() => setShowPassword((current) => !current)}
                            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                          >
                            {showPassword ? "Ocultar" : "Mostrar"}
                          </button>
                        </div>
                      </label>
                    </div>

                    <button type="submit" disabled={submitting}>
                      {submitting ? "Criando conta..." : "Finalizar cadastro"}
                    </button>
                  </>
                )}

                {error && <p className="error-text">{error}</p>}
              </form>

              <div className="auth-flow-footer">
                <p>
                  Já possui conta? <Link to="/login">Acesse aqui</Link>
                </p>
                {step !== "dados" && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setStep("dados")}
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
