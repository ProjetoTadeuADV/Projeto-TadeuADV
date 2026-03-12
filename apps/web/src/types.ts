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
  clienteNome?: string | null;
  responsavelNome?: string | null;
  responsavelEmail?: string | null;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AuthAccessProfile {
  uid: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  isMaster: boolean;
  isOperator: boolean;
  accessLevel: "user" | "operator" | "master";
  canAccessAdmin: boolean;
  isBootstrapMaster: boolean;
}

export interface AccountProfile {
  id: string;
  email: string | null;
  firebaseUid: string;
  name: string | null;
  avatarUrl: string | null;
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
  avatarUrl: string | null;
  cpf: string | null;
  emailVerified: boolean;
  isMaster: boolean;
  isOperator: boolean;
  accessLevel: "user" | "operator" | "master";
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

export interface MasterUserRequest {
  id: string;
  varaNome: string;
  cpf: string;
  resumo: string;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MasterUserActivity {
  user: MasterUserOverview;
  requests: MasterUserRequest[];
}
