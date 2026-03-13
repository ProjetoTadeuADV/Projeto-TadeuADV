import { getFirebaseAuth, getFirebaseFirestore } from "../src/config/firebaseAdmin.js";
import { env, hasFirebaseCredentials } from "../src/config/env.js";
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

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function getTargetEmails(): string[] {
  const args = process.argv.slice(2).map(normalizeEmail).filter(Boolean);
  if (args.length > 0) {
    return Array.from(new Set(args));
  }

  if (env.MASTER_EMAILS.length > 0) {
    return env.MASTER_EMAILS;
  }

  return [];
}

async function main() {
  if (!hasFirebaseCredentials()) {
    throw new Error("Credenciais Firebase ausentes para promover master.");
  }

  const targetEmails = getTargetEmails();
  if (targetEmails.length === 0) {
    throw new Error(
      "Informe e-mail(s) no comando ou configure MASTER_EMAILS no .env para promover usuario master."
    );
  }

  const auth = getFirebaseAuth();
  const repository = new FirestoreCaseRepository(getFirebaseFirestore());
  const now = new Date().toISOString();

  for (const email of targetEmails) {
    const user = await auth.getUserByEmail(email);
    const claims = user.customClaims ?? {};
    const nextClaims = {
      ...claims,
      role: "master",
      isMaster: true,
      isOperator: false
    };

    await auth.setCustomUserClaims(user.uid, nextClaims);

    const createdAt = parseDate(user.metadata.creationTime, now);
    const lastSeenAt = parseDate(user.metadata.lastSignInTime, createdAt);
    await repository.upsertUser({
      id: user.uid,
      email: user.email ?? email,
      name: user.displayName ?? null,
      avatarUrl: user.photoURL ?? null,
      emailVerified: user.emailVerified,
      isMaster: true,
      isOperator: false,
      createdAt,
      lastSeenAt
    });

    console.log(`[grant-master] OK: ${email} (uid=${user.uid})`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "erro desconhecido";
  console.error(`[grant-master] Falha: ${message}`);
  process.exit(1);
});
