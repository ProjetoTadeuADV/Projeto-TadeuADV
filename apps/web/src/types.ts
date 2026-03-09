export interface ApiSuccessResponse<T> {
  status: "ok";
  result: T;
}

export interface ApiErrorResponse {
  status: "error";
  message: string;
  details?: unknown;
}

export interface VaraOption {
  id: string;
  nome: string;
}

export type CaseStatus = "recebido" | "em_analise" | "encerrado";

export interface CpfConsultaResult {
  cpf: string;
  nome: string;
  situacao: "regular" | "pendente" | "indisponivel";
  source: "mock";
  updatedAt: string;
}

export interface CaseRecord {
  id: string;
  userId: string;
  varaId: string;
  varaNome: string;
  cpf: string;
  resumo: string;
  cpfConsulta: CpfConsultaResult | null;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
}

