import { Router } from "express";
import { isMasterEmail } from "../config/env.js";
import { VARAS } from "../constants/varas.js";
import type { AppDependencies } from "../dependencies.js";
import { authMiddleware } from "../middleware/auth.js";
import type { CaseRecord, UserRecord } from "../types/case.js";
import {
  validateCreateCaseInput,
  validateCpfLookupPayload,
  validateMasterAccessPayload,
  validateUserProfilePayload
} from "../services/caseInput.js";
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

function summarizeAdminUser(user: UserRecord, userCases: CaseRecord[]) {
  const activeCases = userCases.filter((item) => item.status !== "encerrado").length;
  const bootstrapMaster = isMasterEmail(user.email);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    cpf: user.cpf ?? null,
    emailVerified: user.emailVerified,
    isMaster: bootstrapMaster || user.isMaster,
    isBootstrapMaster: bootstrapMaster,
    createdAt: user.createdAt,
    lastSeenAt: user.lastSeenAt,
    totalCases: userCases.length,
    activeCases,
    lastCaseAt: getLatestCaseDate(userCases)
  };
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
          emailVerified: req.user.emailVerified,
          isMaster: req.user.isMaster,
          isBootstrapMaster: req.user.isBootstrapMaster
        }
      });
    } catch (error) {
      next(error);
    }
  });

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
      const updated = await deps.repository.updateUserProfile(req.user.uid, {
        cpf: payload.cpf,
        name: payload.name ?? req.user.name
      });

      res.status(200).json({
        status: "ok",
        result: updated
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

      if (!req.user.isMaster) {
        throw new HttpError(403, "Acesso restrito ao usuário master.");
      }

      const [users, cases] = await Promise.all([deps.repository.listUsers(), deps.repository.listAllCases()]);
      const userCasesMap = buildUserCasesMap(cases);

      const summarizedUsers = users
        .map((user) => summarizeAdminUser(user, userCasesMap.get(user.id) ?? []))
        .sort((a, b) => {
          if (Number(b.isMaster) !== Number(a.isMaster)) {
            return Number(b.isMaster) - Number(a.isMaster);
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

      const updated = await deps.repository.setUserMasterStatus(target.id, payload.isMaster);
      if (!updated) {
        throw new HttpError(404, "Usuário não encontrado.");
      }

      res.status(200).json({
        status: "ok",
        result: {
          id: updated.id,
          email: updated.email,
          isMaster: updated.isMaster,
          isBootstrapMaster: false
        }
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
