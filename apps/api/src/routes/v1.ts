import { Router } from "express";
import { env, hasFirebaseCredentials, isMasterEmail } from "../config/env.js";
import { getFirebaseAuth } from "../config/firebaseAdmin.js";
import { VARAS } from "../constants/varas.js";
import type { AppDependencies } from "../dependencies.js";
import { authMiddleware } from "../middleware/auth.js";
import { FirestoreCaseRepository } from "../repositories/firestoreCaseRepository.js";
import type { CaseRecord, UserRecord } from "../types/case.js";
import {
  validateAccountProfilePatchPayload,
  validateAccessLevelPayload,
  validateCreateCaseInput,
  validateCpfLookupPayload,
  validateLoginIdentifierPayload,
  validateMasterAccessPayload,
  validateRegisterAvailabilityPayload,
  validateUserProfilePayload
} from "../services/caseInput.js";
import {
  isCustomVerificationEmailEnabled,
  sendCustomVerificationEmail
} from "../services/verificationEmailSender.js";
import { HttpError } from "../utils/httpError.js";

function countRecentUsers(users: UserRecord[], days: number): number {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return users.filter((user) => new Date(user.lastSeenAt).getTime() >= cutoff).length;
}

function countNewUsers(users: UserRecord[], days: number): number {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return users.filter((user) => new Date(user.createdAt).getTime() >= cutoff).length;
}

function getLatestCaseDate(cases: CaseRecord[]): string | null {
  if (cases.length === 0) {
    return null;
  }

  return [...cases].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0].updatedAt;
}

function buildUserCasesMap(cases: CaseRecord[]): Map<string, CaseRecord[]> {
  const userCasesMap = new Map<string, CaseRecord[]>();

  for (const item of cases) {
    const current = userCasesMap.get(item.userId) ?? [];
    current.push(item);
    userCasesMap.set(item.userId, current);
  }

  return userCasesMap;
}

function enrichCaseWithOwner(
  caseItem: CaseRecord,
  usersById: Map<string, UserRecord>
): CaseRecord & {
  clienteNome: string | null;
  responsavelNome: string | null;
  responsavelEmail: string | null;
} {
  const owner = usersById.get(caseItem.userId);

  return {
    ...caseItem,
    clienteNome: caseItem.cpfConsulta?.nome ?? null,
    responsavelNome: owner?.name ?? null,
    responsavelEmail: owner?.email ?? null
  };
}

function summarizeAdminUser(user: UserRecord, userCases: CaseRecord[]) {
  const activeCases = userCases.filter((item) => item.status !== "encerrado").length;
  const bootstrapMaster = isMasterEmail(user.email);
  const isMaster = bootstrapMaster || user.isMaster;
  const isOperator = !isMaster && user.isOperator === true;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl ?? null,
    cpf: user.cpf ?? null,
    emailVerified: user.emailVerified,
    isMaster,
    isOperator,
    accessLevel: isMaster ? "master" : isOperator ? "operator" : "user",
    isBootstrapMaster: bootstrapMaster,
    createdAt: user.createdAt,
    lastSeenAt: user.lastSeenAt,
    totalCases: userCases.length,
    activeCases,
    lastCaseAt: getLatestCaseDate(userCases)
  };
}

function buildCurrentUserProfile(
  userRecord: UserRecord | null,
  fallback: { uid: string; email: string | null; name: string | null; avatarUrl: string | null }
) {
  const resolvedId = userRecord?.id ?? fallback.uid;
  const resolvedEmail = userRecord?.email ?? fallback.email;
  const resolvedName = userRecord ? userRecord.name ?? null : fallback.name;
  const resolvedAvatarUrl = userRecord ? userRecord.avatarUrl ?? null : fallback.avatarUrl;

  return {
    id: resolvedId,
    email: resolvedEmail,
    firebaseUid: fallback.uid,
    name: resolvedName,
    avatarUrl: resolvedAvatarUrl
  };
}

interface AuthSnapshotUser {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  createdAt: string;
  lastSeenAt: string;
}

function canAccessAdminPanel(user: { isMaster: boolean; isOperator?: boolean } | null | undefined): boolean {
  if (!user) {
    return false;
  }

  return user.isMaster || user.isOperator === true;
}

function ensureAdminPanelAccess(user: { isMaster: boolean; isOperator?: boolean } | null | undefined): void {
  if (!canAccessAdminPanel(user)) {
    throw new HttpError(403, "Acesso restrito aos perfis master ou operador.");
  }
}

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

function resolveLatestDate(values: Array<string | null | undefined>, fallback: string): string {
  const valid = values
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()));

  if (valid.length === 0) {
    return fallback;
  }

  valid.sort((a, b) => b.getTime() - a.getTime());
  return valid[0].toISOString();
}

function resolveVerificationContinueUrl(): string {
  if (env.VERIFY_EMAIL_CONTINUE_URL) {
    return env.VERIFY_EMAIL_CONTINUE_URL;
  }

  const [firstCorsOrigin] = env.CORS_ORIGIN.split(",").map((item) => item.trim());
  return firstCorsOrigin || "http://localhost:5173";
}

function normalizeEmail(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

async function emailExistsInFirebaseAuth(email: string): Promise<boolean> {
  if (isTestRuntime() || !hasFirebaseCredentials()) {
    return false;
  }

  try {
    await getFirebaseAuth().getUserByEmail(email);
    return true;
  } catch (error) {
    if (isFirebaseUserNotFoundError(error)) {
      return false;
    }

    throw error;
  }
}

async function listFirebaseAuthUsers(): Promise<AuthSnapshotUser[]> {
  if (!hasFirebaseCredentials()) {
    return [];
  }

  const auth = getFirebaseAuth();
  const users: AuthSnapshotUser[] = [];
  let pageToken: string | undefined;
  const now = new Date().toISOString();

  do {
    const page = await auth.listUsers(1000, pageToken);

    users.push(
      ...page.users.map((item) => {
        const createdAt = parseDate(item.metadata.creationTime, now);
        const lastSeenAt = parseDate(item.metadata.lastSignInTime, createdAt);

        return {
          id: item.uid,
          email: item.email ?? null,
          name: item.displayName ?? null,
          avatarUrl: item.photoURL ?? null,
          emailVerified: item.emailVerified,
          createdAt,
          lastSeenAt
        };
      })
    );

    pageToken = page.pageToken;
  } while (pageToken);

  return users;
}

function isTestRuntime(): boolean {
  return env.NODE_ENV === "test" || Boolean(process.env.VITEST);
}

function isFirebaseUserNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const typed = error as {
    code?: string;
    message?: string;
    errorInfo?: { code?: string };
  };

  const code = typed.code ?? typed.errorInfo?.code ?? "";
  if (code === "auth/user-not-found") {
    return true;
  }

  const message = (typed.message ?? "").toLowerCase();
  return message.includes("no user record") || message.includes("user-not-found");
}

async function deleteFirebaseUserIfPossible(userId: string): Promise<void> {
  if (isTestRuntime() || !hasFirebaseCredentials()) {
    return;
  }

  try {
    await getFirebaseAuth().deleteUser(userId);
  } catch (error) {
    if (isFirebaseUserNotFoundError(error)) {
      return;
    }

    throw error;
  }
}

export function createV1Router(deps: AppDependencies) {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      result: {
        service: "jec-api",
        timestamp: new Date().toISOString()
      }
    });
  });

  router.get("/varas", (_req, res) => {
    res.status(200).json({
      status: "ok",
      result: VARAS
    });
  });

  router.get("/auth/session", authMiddleware(deps.authVerifier, deps.repository), async (req, res, next) => {
    try {
      if (!req.user) {
        throw new HttpError(401, "Usuário não autenticado.");
      }

      res.status(200).json({
        status: "ok",
        result: {
          uid: req.user.uid,
          email: req.user.email,
          name: req.user.name,
          avatarUrl: req.user.avatarUrl,
          emailVerified: req.user.emailVerified,
          isMaster: req.user.isMaster,
          isOperator: req.user.isOperator,
          accessLevel: req.user.isMaster ? "master" : req.user.isOperator ? "operator" : "user",
          canAccessAdmin: canAccessAdminPanel(req.user),
          isBootstrapMaster: req.user.isBootstrapMaster
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/auth/resolve-login", async (req, res, next) => {
    try {
      const parsed = validateLoginIdentifierPayload(req.body);

      if (parsed.type === "email") {
        res.status(200).json({
          status: "ok",
          result: {
            email: parsed.value
          }
        });
        return;
      }

      const found = await deps.repository.findUserByCpf(parsed.value);
      if (!found?.email) {
        throw new HttpError(404, "Credencial não encontrada.");
      }

      res.status(200).json({
        status: "ok",
        result: {
          email: found.email
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/auth/register-availability", async (req, res, next) => {
    try {
      const payload = validateRegisterAvailabilityPayload(req.body);
      const normalizedEmail = payload.email;

      const [cpfOwner, users, emailInFirebaseAuth] = await Promise.all([
        deps.repository.findUserByCpf(payload.cpf),
        deps.repository.listUsers(),
        emailExistsInFirebaseAuth(normalizedEmail)
      ]);

      const emailInRepository = users.some(
        (item) => normalizeEmail(item.email) === normalizedEmail
      );

      res.status(200).json({
        status: "ok",
        result: {
          cpfInUse: Boolean(cpfOwner),
          emailInUse: emailInRepository || emailInFirebaseAuth
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/auth/verification-email",
    authMiddleware(deps.authVerifier, deps.repository),
    async (req, res, next) => {
      try {
        if (!req.user) {
          throw new HttpError(401, "Usuário não autenticado.");
        }

        if (!req.user.email) {
          throw new HttpError(400, "Não foi encontrado e-mail nesta conta.");
        }

        if (req.user.emailVerified) {
          res.status(200).json({
            status: "ok",
            result: {
              sent: false,
              reason: "already-verified"
            }
          });
          return;
        }

        if (!isCustomVerificationEmailEnabled()) {
          res.status(200).json({
            status: "ok",
            result: {
              sent: false,
              reason: "custom-sender-not-configured"
            }
          });
          return;
        }

        let verificationLink = "";
        try {
          verificationLink = await getFirebaseAuth().generateEmailVerificationLink(req.user.email, {
            url: resolveVerificationContinueUrl(),
            handleCodeInApp: false
          });
        } catch (linkError) {
          const message = linkError instanceof Error ? linkError.message : "unknown";
          res.status(200).json({
            status: "ok",
            result: {
              sent: false,
              reason: "verification-link-failed",
              provider: "firebase-auth",
              message
            }
          });
          return;
        }

        try {
          await sendCustomVerificationEmail({
            email: req.user.email,
            name: req.user.name,
            verificationLink
          });
        } catch (sendError) {
          const message = sendError instanceof Error ? sendError.message : "unknown";
          res.status(200).json({
            status: "ok",
            result: {
              sent: false,
              reason: "custom-send-failed",
              provider: "sendgrid",
              message
            }
          });
          return;
        }

        res.status(200).json({
          status: "ok",
          result: {
            sent: true,
            channel: "custom"
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post("/cpf/consulta", authMiddleware(deps.authVerifier, deps.repository), async (req, res, next) => {
    try {
      const { cpf } = validateCpfLookupPayload(req.body);
      const result = await deps.cpfProvider.lookup(cpf);

      res.status(200).json({
        status: "ok",
        result
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/users/profile", authMiddleware(deps.authVerifier, deps.repository), async (req, res, next) => {
    try {
      if (!req.user) {
        throw new HttpError(401, "Usuário não autenticado.");
      }

      const payload = validateUserProfilePayload(req.body);
      const currentUserUid = req.user.uid;
      const currentUserEmail = req.user.email;
      const existingCpfUser = await deps.repository.findUserByCpf(payload.cpf);
      if (existingCpfUser && existingCpfUser.id !== currentUserUid) {
        throw new HttpError(
          409,
          'Já existe uma conta com este CPF. Faça login ou use "Esqueci minha senha".'
        );
      }

      const normalizedCurrentEmail = normalizeEmail(currentUserEmail);
      if (normalizedCurrentEmail) {
        const users = await deps.repository.listUsers();
        const emailInUse = users.some(
          (item) => item.id !== currentUserUid && normalizeEmail(item.email) === normalizedCurrentEmail
        );

        if (emailInUse) {
          throw new HttpError(
            409,
            'Já existe uma conta com este e-mail. Faça login ou use "Esqueci minha senha".'
          );
        }
      }

      const updated = await deps.repository.updateUserProfile(currentUserUid, {
        cpf: payload.cpf,
        name: payload.name
      });

      res.status(200).json({
        status: "ok",
        result: updated
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/users/me", authMiddleware(deps.authVerifier, deps.repository), async (req, res, next) => {
    try {
      if (!req.user) {
        throw new HttpError(401, "Usuário não autenticado.");
      }

      const userRecord = await deps.repository.getUserById(req.user.uid);
      res.status(200).json({
        status: "ok",
        result: {
          user: buildCurrentUserProfile(userRecord, {
            uid: req.user.uid,
            email: req.user.email,
            name: req.user.name,
            avatarUrl: req.user.avatarUrl
          })
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/users/me", authMiddleware(deps.authVerifier, deps.repository), async (req, res, next) => {
    try {
      if (!req.user) {
        throw new HttpError(401, "Usuário não autenticado.");
      }

      const payload = validateAccountProfilePatchPayload(req.body);
      const updated = await deps.repository.updateAccountProfile(req.user.uid, payload);

      res.status(200).json({
        status: "ok",
        result: {
          user: buildCurrentUserProfile(updated, {
            uid: req.user.uid,
            email: req.user.email,
            name: req.user.name,
            avatarUrl: req.user.avatarUrl
          })
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/users/me", authMiddleware(deps.authVerifier, deps.repository), async (req, res, next) => {
    try {
      if (!req.user) {
        throw new HttpError(401, "Usuário não autenticado.");
      }

      if (req.user.isBootstrapMaster) {
        throw new HttpError(400, "A conta master principal não pode ser excluída por esta ação.");
      }

      await deleteFirebaseUserIfPossible(req.user.uid);
      const removed = await deps.repository.deleteUserWithCases(req.user.uid);

      res.status(200).json({
        status: "ok",
        result: {
          deletedUserId: req.user.uid,
          deletedCases: removed.deletedCases
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/cases", authMiddleware(deps.authVerifier, deps.repository), async (req, res, next) => {
    try {
      if (!req.user) {
        throw new HttpError(401, "Usuário não autenticado.");
      }

      const validated = validateCreateCaseInput(req.body);
      const cpfConsulta = await deps.cpfProvider.lookup(validated.cpf);

      const created = await deps.repository.createCase({
        userId: req.user.uid,
        varaId: validated.varaId,
        varaNome: validated.varaNome,
        cpf: validated.cpf,
        resumo: validated.resumo,
        cpfConsulta
      });

      res.status(201).json({
        status: "ok",
        result: created
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/cases", authMiddleware(deps.authVerifier, deps.repository), async (req, res, next) => {
    try {
      if (!req.user) {
        throw new HttpError(401, "Usuário não autenticado.");
      }

      if (canAccessAdminPanel(req.user)) {
        const [allCases, users] = await Promise.all([
          deps.repository.listAllCases(),
          deps.repository.listUsers()
        ]);
        const usersById = new Map(users.map((item) => [item.id, item]));
        const enrichedCases = allCases.map((item) => enrichCaseWithOwner(item, usersById));

        res.status(200).json({
          status: "ok",
          result: enrichedCases
        });
        return;
      }

      const cases = await deps.repository.listCasesByUserId(req.user.uid);
      res.status(200).json({
        status: "ok",
        result: cases
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/cases/:id", authMiddleware(deps.authVerifier, deps.repository), async (req, res, next) => {
    try {
      if (!req.user) {
        throw new HttpError(401, "Usuário não autenticado.");
      }

      if (canAccessAdminPanel(req.user)) {
        const [allCases, users] = await Promise.all([
          deps.repository.listAllCases(),
          deps.repository.listUsers()
        ]);
        const found = allCases.find((item) => item.id === req.params.id);
        if (!found) {
          throw new HttpError(404, "Caso não encontrado.");
        }

        const usersById = new Map(users.map((item) => [item.id, item]));
        res.status(200).json({
          status: "ok",
          result: enrichCaseWithOwner(found, usersById)
        });
        return;
      }

      const found = await deps.repository.getCaseByIdForUser(req.params.id, req.user.uid);
      if (!found) {
        throw new HttpError(404, "Caso não encontrado.");
      }

      res.status(200).json({
        status: "ok",
        result: found
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/admin/overview", authMiddleware(deps.authVerifier, deps.repository), async (req, res, next) => {
    try {
      if (!req.user) {
        throw new HttpError(401, "Usuário não autenticado.");
      }

      ensureAdminPanelAccess(req.user);

      let users = await deps.repository.listUsers();
      let authUsers: AuthSnapshotUser[] = [];

      if (deps.repository instanceof FirestoreCaseRepository) {
        try {
          authUsers = await listFirebaseAuthUsers();
        } catch {
          authUsers = [];
        }
      }

      if (authUsers.length > 0) {
        const usersById = new Map(users.map((item) => [item.id, item]));

        await Promise.all(
          authUsers.map(async (item) => {
            const existing = usersById.get(item.id);
            const isMaster = isMasterEmail(item.email) || existing?.isMaster === true;
            await deps.repository.upsertUser({
              id: item.id,
              email: item.email ?? existing?.email ?? null,
              name: item.name ?? existing?.name ?? null,
              avatarUrl: item.avatarUrl ?? existing?.avatarUrl ?? null,
              cpf: existing?.cpf ?? null,
              emailVerified: item.emailVerified,
              isMaster,
              isOperator: isMaster ? false : (existing?.isOperator ?? false),
              createdAt: existing?.createdAt ?? item.createdAt,
              lastSeenAt: resolveLatestDate([existing?.lastSeenAt, item.lastSeenAt], item.createdAt)
            });
          })
        );

        users = await deps.repository.listUsers();
      }

      const cases = await deps.repository.listAllCases();
      const userCasesMap = buildUserCasesMap(cases);

      const summarizedUsers = users
        .map((user) => summarizeAdminUser(user, userCasesMap.get(user.id) ?? []))
        .sort((a, b) => {
          const roleScoreA = a.isMaster ? 2 : a.isOperator ? 1 : 0;
          const roleScoreB = b.isMaster ? 2 : b.isOperator ? 1 : 0;
          if (roleScoreB !== roleScoreA) {
            return roleScoreB - roleScoreA;
          }

          if (a.totalCases !== b.totalCases) {
            return b.totalCases - a.totalCases;
          }

          return a.lastSeenAt < b.lastSeenAt ? 1 : -1;
        });

      const usersById = new Map(users.map((user) => [user.id, user]));
      const recentCases = [...cases]
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
        .slice(0, 8)
        .map((item) => {
          const owner = usersById.get(item.userId);
          return {
            id: item.id,
            userId: item.userId,
            userName: owner?.name ?? null,
            userEmail: owner?.email ?? null,
            varaNome: item.varaNome,
            status: item.status,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt
          };
        });

      res.status(200).json({
        status: "ok",
        result: {
          summary: {
            totalUsers: users.length,
            totalMasterUsers: summarizedUsers.filter((user) => user.isMaster).length,
            verifiedUsers: users.filter((user) => user.emailVerified).length,
            activeUsersLast30Days: countRecentUsers(users, 30),
            newUsersLast7Days: countNewUsers(users, 7),
            totalCases: cases.length,
            activeCases: cases.filter((item) => item.status !== "encerrado").length,
            closedCases: cases.filter((item) => item.status === "encerrado").length
          },
          users: summarizedUsers,
          recentCases
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.get(
    "/admin/users/:id/activity",
    authMiddleware(deps.authVerifier, deps.repository),
    async (req, res, next) => {
      try {
        if (!req.user) {
          throw new HttpError(401, "Usuário não autenticado.");
        }

        ensureAdminPanelAccess(req.user);

        const targetUser = await deps.repository.getUserById(req.params.id);
        if (!targetUser) {
          throw new HttpError(404, "Usuário não encontrado.");
        }

        const allCases = await deps.repository.listAllCases();
        const userCases = allCases
          .filter((item) => item.userId === targetUser.id)
          .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

        res.status(200).json({
          status: "ok",
          result: {
            user: summarizeAdminUser(targetUser, userCases),
            requests: userCases.map((item) => ({
              id: item.id,
              varaNome: item.varaNome,
              cpf: item.cpf,
              resumo: item.resumo,
              status: item.status,
              createdAt: item.createdAt,
              updatedAt: item.updatedAt
            }))
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.patch("/admin/users/:id/access", authMiddleware(deps.authVerifier, deps.repository), async (req, res, next) => {
    try {
      if (!req.user) {
        throw new HttpError(401, "Usuário não autenticado.");
      }

      if (!req.user.isMaster) {
        throw new HttpError(403, "Acesso restrito ao usuário master.");
      }

      const payload = validateAccessLevelPayload(req.body);
      const target = await deps.repository.getUserById(req.params.id);
      if (!target) {
        throw new HttpError(404, "Usuário não encontrado.");
      }

      const targetIsBootstrapMaster = isMasterEmail(target.email);
      if (targetIsBootstrapMaster) {
        throw new HttpError(400, "A conta master principal não pode ser alterada pelo painel.");
      }

      if (target.id === req.user.uid) {
        throw new HttpError(400, "Para sua segurança, altere seu acesso usando outra conta master.");
      }

      const updated = await deps.repository.setUserAccessLevel(target.id, payload.accessLevel);
      if (!updated) {
        throw new HttpError(404, "Usuário não encontrado.");
      }

      res.status(200).json({
        status: "ok",
        result: {
          id: updated.id,
          email: updated.email,
          accessLevel: payload.accessLevel,
          isMaster: updated.isMaster,
          isOperator: updated.isOperator ?? false,
          isBootstrapMaster: false
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/admin/users/:id/master", authMiddleware(deps.authVerifier, deps.repository), async (req, res, next) => {
    try {
      if (!req.user) {
        throw new HttpError(401, "Usuário não autenticado.");
      }

      if (!req.user.isMaster) {
        throw new HttpError(403, "Acesso restrito ao usuário master.");
      }

      const payload = validateMasterAccessPayload(req.body);
      const target = await deps.repository.getUserById(req.params.id);
      if (!target) {
        throw new HttpError(404, "Usuário não encontrado.");
      }

      const targetIsBootstrapMaster = isMasterEmail(target.email);
      if (targetIsBootstrapMaster) {
        throw new HttpError(400, "A conta master principal não pode ser alterada pelo painel.");
      }

      if (target.id === req.user.uid) {
        throw new HttpError(400, "Para sua segurança, altere seu acesso master usando outra conta master.");
      }

      const updated = await deps.repository.setUserAccessLevel(target.id, payload.isMaster ? "master" : "user");
      if (!updated) {
        throw new HttpError(404, "Usuário não encontrado.");
      }

      res.status(200).json({
        status: "ok",
        result: {
          id: updated.id,
          email: updated.email,
          isMaster: updated.isMaster,
          isOperator: updated.isOperator ?? false,
          isBootstrapMaster: false
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/admin/users/:id", authMiddleware(deps.authVerifier, deps.repository), async (req, res, next) => {
    try {
      if (!req.user) {
        throw new HttpError(401, "Usuário não autenticado.");
      }

      if (!req.user.isMaster) {
        throw new HttpError(403, "Acesso restrito ao usuário master.");
      }

      if (req.params.id === req.user.uid) {
        throw new HttpError(400, "Use a opção de excluir a própria conta no menu superior.");
      }

      const target = await deps.repository.getUserById(req.params.id);
      if (!target) {
        throw new HttpError(404, "Usuário não encontrado.");
      }

      if (isMasterEmail(target.email)) {
        throw new HttpError(400, "A conta master principal não pode ser excluída pelo painel.");
      }

      await deleteFirebaseUserIfPossible(target.id);
      const removed = await deps.repository.deleteUserWithCases(target.id);

      res.status(200).json({
        status: "ok",
        result: {
          deletedUserId: target.id,
          deletedCases: removed.deletedCases
        }
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}


