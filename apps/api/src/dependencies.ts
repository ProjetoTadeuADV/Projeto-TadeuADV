import { getFirebaseAuth, getFirebaseFirestore } from "./config/firebaseAdmin.js";
import { hasFirebaseCredentials, isMasterEmail } from "./config/env.js";
import { FirestoreCaseRepository } from "./repositories/firestoreCaseRepository.js";
import { MockCpfProvider } from "./services/cpfProvider.js";
import { AsaasBillingProvider } from "./services/asaasProvider.js";
import type { AuthVerifier } from "./types/auth.js";
import type { CaseRepository } from "./repositories/caseRepository.js";
import type { CpfProvider } from "./services/cpfProvider.js";
import type { BillingProvider } from "./services/asaasProvider.js";

function readBooleanClaim(claims: Record<string, unknown>, key: string): boolean {
  const value = claims[key];
  if (value === true) {
    return true;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }

  if (typeof value === "number") {
    return value === 1;
  }

  return false;
}

function resolveClaimAccess(claims: Record<string, unknown>) {
  const roleClaim = typeof claims.role === "string" ? claims.role.trim().toLowerCase() : "";
  const claimMaster =
    roleClaim === "master" ||
    readBooleanClaim(claims, "isMaster") ||
    readBooleanClaim(claims, "master");
  const claimOperator =
    roleClaim === "operator" ||
    readBooleanClaim(claims, "isOperator") ||
    readBooleanClaim(claims, "operator");

  return {
    claimMaster,
    claimOperator
  };
}

class FirebaseAuthVerifier implements AuthVerifier {
  async verifyIdToken(token: string) {
    const decoded = await getFirebaseAuth().verifyIdToken(token);
    const claims = decoded as unknown as Record<string, unknown>;
    const { claimMaster, claimOperator } = resolveClaimAccess(claims);
    const bootstrapMaster = isMasterEmail(decoded.email);
    const isMaster = bootstrapMaster || claimMaster;
    const isOperator = !isMaster && claimOperator;

    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      name: decoded.name ?? null,
      avatarUrl: typeof decoded.picture === "string" ? decoded.picture : null,
      emailVerified: decoded.email_verified ?? false,
      isMaster,
      isOperator,
      isBootstrapMaster: bootstrapMaster
    };
  }
}

export interface AppDependencies {
  authVerifier: AuthVerifier;
  repository: CaseRepository;
  cpfProvider: CpfProvider;
  paymentProvider: BillingProvider;
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
    cpfProvider: new MockCpfProvider(),
    paymentProvider: new AsaasBillingProvider()
  };
}
