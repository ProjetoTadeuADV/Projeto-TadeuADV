import { getFirebaseAuth, getFirebaseFirestore } from "./config/firebaseAdmin.js";
import { hasFirebaseCredentials, isMasterEmail } from "./config/env.js";
import { FirestoreCaseRepository } from "./repositories/firestoreCaseRepository.js";
import { MockCpfProvider } from "./services/cpfProvider.js";
import type { AuthVerifier } from "./types/auth.js";
import type { CaseRepository } from "./repositories/caseRepository.js";
import type { CpfProvider } from "./services/cpfProvider.js";

class FirebaseAuthVerifier implements AuthVerifier {
  async verifyIdToken(token: string) {
    const decoded = await getFirebaseAuth().verifyIdToken(token);
    const bootstrapMaster = isMasterEmail(decoded.email);

    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      name: decoded.name ?? null,
      avatarUrl: typeof decoded.picture === "string" ? decoded.picture : null,
      emailVerified: decoded.email_verified ?? false,
      isMaster: bootstrapMaster,
      isOperator: false,
      isBootstrapMaster: bootstrapMaster
    };
  }
}

export interface AppDependencies {
  authVerifier: AuthVerifier;
  repository: CaseRepository;
  cpfProvider: CpfProvider;
}

export function createDefaultDependencies(): AppDependencies {
  if (!hasFirebaseCredentials()) {
    throw new Error(
      "Credenciais do Firebase ausentes. Configure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY."
    );
  }

  return {
    authVerifier: new FirebaseAuthVerifier(),
    repository: new FirestoreCaseRepository(getFirebaseFirestore()),
    cpfProvider: new MockCpfProvider()
  };
}
