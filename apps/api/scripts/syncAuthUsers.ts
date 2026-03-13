import { getFirebaseAuth, getFirebaseFirestore } from "../src/config/firebaseAdmin.js";
import { hasFirebaseCredentials, isMasterEmail } from "../src/config/env.js";
import { FirestoreCaseRepository } from "../src/repositories/firestoreCaseRepository.js";

function parseDate(value: string | undefined | null, fallback: string): string {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return parsed.toISOString();
}

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

function resolveAccessFromClaims(claims: Record<string, unknown>) {
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
    isMaster: claimMaster,
    isOperator: !claimMaster && claimOperator
  };
}

async function main() {
  if (!hasFirebaseCredentials()) {
    throw new Error("Credenciais Firebase ausentes para sincronizacao.");
  }

  const auth = getFirebaseAuth();
  const repository = new FirestoreCaseRepository(getFirebaseFirestore());
  const now = new Date().toISOString();

  let total = 0;
  let masters = 0;
  let operators = 0;
  let pageToken: string | undefined;

  do {
    const page = await auth.listUsers(1000, pageToken);

    for (const item of page.users) {
      const createdAt = parseDate(item.metadata.creationTime, now);
      const lastSeenAt = parseDate(item.metadata.lastSignInTime, createdAt);
      const accessFromClaims = resolveAccessFromClaims(item.customClaims ?? {});
      const bootstrapMaster = isMasterEmail(item.email);
      const isMaster = bootstrapMaster || accessFromClaims.isMaster;
      const isOperator = !isMaster && accessFromClaims.isOperator;

      await repository.upsertUser({
        id: item.uid,
        email: item.email ?? null,
        name: item.displayName ?? null,
        avatarUrl: item.photoURL ?? null,
        emailVerified: item.emailVerified,
        isMaster,
        isOperator,
        createdAt,
        lastSeenAt
      });

      total += 1;
      if (isMaster) {
        masters += 1;
      } else if (isOperator) {
        operators += 1;
      }
    }

    pageToken = page.pageToken;
  } while (pageToken);

  console.log(
    `[sync-auth-users] OK. usuarios=${total}, masters=${masters}, operators=${operators}, users=${total - masters - operators}`
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "erro desconhecido";
  console.error(`[sync-auth-users] Falha: ${message}`);
  process.exit(1);
});
