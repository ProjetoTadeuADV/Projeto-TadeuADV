export interface AuthenticatedUser {
  uid: string;
  email: string | null;
  name: string | null;
}

export interface AuthVerifier {
  verifyIdToken(token: string): Promise<AuthenticatedUser>;
}

