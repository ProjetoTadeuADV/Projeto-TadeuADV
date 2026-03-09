import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { formatCpf, isValidCpf } from "../lib/cpf";
import { apiRequest, ApiError } from "../lib/api";

export function RegisterPage() {
  const { register, user, getToken } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!isValidCpf(cpf)) {
      setError("Informe um CPF válido.");
      return;
    }

    setSubmitting(true);
    try {
      await register(name, email, password);
      const token = await getToken();
      await apiRequest("/v1/users/profile", {
        method: "POST",
        token,
        body: {
          cpf,
          name
        }
      });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Não foi possível criar a conta. Tente outro e-mail.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="auth-page">
      <div className="auth-card">
        <h1>Criar Conta</h1>
        <p>Cadastro rápido para começar a abrir seus casos.</p>

        <form onSubmit={handleSubmit} className="form-grid">
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
              required
              inputMode="numeric"
              placeholder="000.000.000-00"
            />
          </label>

          <label>
            E-mail
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
            />
          </label>

          <label>
            Senha
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </label>

          {error && <p className="error-text">{error}</p>}

          <button type="submit" disabled={submitting}>
            {submitting ? "Criando..." : "Criar conta"}
          </button>
        </form>

        <p className="helper-text">
          Já possui conta? <Link to="/login">Entrar</Link>
        </p>
      </div>
    </section>
  );
}
