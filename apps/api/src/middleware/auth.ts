import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import type { CaseRepository } from "../repositories/caseRepository.js";
import type { AuthVerifier } from "../types/auth.js";

function extractErrorDetails(error: unknown): { code: string | null; message: string } {
  if (error instanceof Error) {
    const code =
      typeof (error as Error & { code?: unknown }).code === "string"
        ? ((error as Error & { code?: string }).code ?? null)
        : null;
    return {
      code,
      message: error.message
    };
  }

  return {
    code: null,
    message: "Erro desconhecido na autenticação."
  };
}

export function authMiddleware(authVerifier: AuthVerifier, repository: CaseRepository) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const header = req.headers.authorization;
      if (!header || !header.startsWith("Bearer ")) {
        return res.status(401).json({
          status: "error",
          message: "Token de autenticação ausente."
        });
      }

      const token = header.slice("Bearer ".length).trim();
      const verifiedUser = await authVerifier.verifyIdToken(token);
      const existingUser = await repository.getUserById(verifiedUser.uid);
      const persistedName =
        existingUser?.nameCustomized === true
          ? existingUser.name ?? null
          : existingUser?.name ?? verifiedUser.name;
      const persistedAvatarUrl =
        existingUser?.avatarUrlCustomized === true
          ? existingUser.avatarUrl ?? null
          : existingUser?.avatarUrl ?? verifiedUser.avatarUrl ?? null;
      const hasMasterAccess = verifiedUser.isBootstrapMaster || existingUser?.isMaster === true;
      const hasOperatorAccess = !hasMasterAccess && existingUser?.isOperator === true;
      const resolvedUser = {
        ...verifiedUser,
        name: persistedName,
        avatarUrl: persistedAvatarUrl,
        isMaster: hasMasterAccess,
        isOperator: hasOperatorAccess
      };

      req.user = resolvedUser;
      const now = new Date().toISOString();
      await repository.upsertUser({
        id: resolvedUser.uid,
        email: resolvedUser.email,
        name: persistedName,
        avatarUrl: persistedAvatarUrl,
        emailVerified: resolvedUser.emailVerified,
        isMaster: resolvedUser.isMaster,
        isOperator: resolvedUser.isOperator,
        createdAt: now,
        lastSeenAt: now
      });

      return next();
    } catch (error) {
      const details = extractErrorDetails(error);
      const message = details.message.toLowerCase();
      const isTokenError =
        details.code?.startsWith("auth/") === true ||
        message.includes("id token") ||
        message.includes("token");

      if (isTokenError) {
        return res.status(401).json({
          status: "error",
          message: "Token inválido."
        });
      }

      return res.status(500).json({
        status: "error",
        message: "Falha ao validar sessão no Firebase. Verifique Firestore e credenciais.",
        ...(env.NODE_ENV !== "production"
          ? {
              details
            }
          : {})
      });
    }
  };
}
