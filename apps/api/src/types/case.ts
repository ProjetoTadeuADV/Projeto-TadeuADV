export const CASE_STATUSES = ["recebido", "em_analise", "encerrado"] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  recebido: "Recebido",
  em_analise: "Em análise",
  encerrado: "Encerrado"
};

export function isCaseStatus(value: string): value is CaseStatus {
  return CASE_STATUSES.includes(value as CaseStatus);
}

export interface CpfConsultaResult {
  cpf: string;
  nome: string;
  situacao: "regular" | "pendente" | "indisponivel";
  source: "mock";
  updatedAt: string;
}

export type PetitionDefendantType = "pessoa_fisica" | "pessoa_juridica" | "nao_informado";

export interface PetitionInitialData {
  claimantAddress: string;
  claimSubject: string;
  defendantType: PetitionDefendantType;
  defendantName: string;
  defendantDocument: string | null;
  defendantAddress: string | null;
  facts: string;
  legalGrounds: string;
  requests: string[];
  evidence: string | null;
  claimValue: number | null;
  hearingInterest: boolean;
}

export interface CaseRecord {
  id: string;
  userId: string;
  varaId: string;
  varaNome: string;
  cpf: string;
  resumo: string;
  cpfConsulta: CpfConsultaResult | null;
  petitionInitial?: PetitionInitialData | null;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
}

export interface NewCaseInput {
  userId: string;
  varaId: string;
  varaNome: string;
  cpf: string;
  resumo: string;
  cpfConsulta: CpfConsultaResult | null;
  petitionInitial?: PetitionInitialData | null;
}

export interface UserRecord {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl?: string | null;
  nameCustomized?: boolean;
  avatarUrlCustomized?: boolean;
  cpf?: string | null;
  emailVerified: boolean;
  isMaster: boolean;
  isOperator?: boolean;
  createdAt: string;
  lastSeenAt: string;
}
