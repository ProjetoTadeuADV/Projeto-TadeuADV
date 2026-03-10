export interface AuthenticatedUser {
  uid: string;
  email: string | null;
  name: string | null;
  emailVerified: boolean;
  isMaster: boolean;
  isBootstrapMaster: boolean;
}

export interface AuthVerifier {
  verifyIdToken(token: string): Promise<AuthenticatedUser>;
}
