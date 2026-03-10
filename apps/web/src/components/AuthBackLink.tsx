import { Link } from "react-router-dom";

export function AuthBackLink() {
  return (
    <Link to="/" className="auth-back-link" aria-label="Voltar à página inicial">
      <span aria-hidden="true">←</span>
      <span>Voltar ao início</span>
    </Link>
  );
}
