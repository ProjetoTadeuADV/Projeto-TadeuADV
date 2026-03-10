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

export interface AuthAccessProfile {
  uid: string;
  email: string | null;
  name: string | null;
  emailVerified: boolean;
  isMaster: boolean;
  isBootstrapMaster: boolean;
}

export interface MasterSummary {
  totalUsers: number;
  totalMasterUsers: number;
  verifiedUsers: number;
  activeUsersLast30Days: number;
  newUsersLast7Days: number;
  totalCases: number;
  activeCases: number;
  closedCases: number;
}

export interface MasterUserOverview {
  id: string;
  email: string | null;
  name: string | null;
  cpf: string | null;
  emailVerified: boolean;
  isMaster: boolean;
  isBootstrapMaster: boolean;
  createdAt: string;
  lastSeenAt: string;
  totalCases: number;
  activeCases: number;
  lastCaseAt: string | null;
}

export interface MasterRecentCase {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  varaNome: string;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MasterOverview {
  summary: MasterSummary;
  users: MasterUserOverview[];
  recentCases: MasterRecentCase[];
}
