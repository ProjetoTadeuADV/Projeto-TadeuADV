import type { NextFunction, Request, Response } from "express";
import type { AuthVerifier } from "../types/auth.js";
import type { CaseRepository } from "../repositories/caseRepository.js";

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
      const user = await authVerifier.verifyIdToken(token);

      req.user = user;
      const now = new Date().toISOString();
      await repository.upsertUser({
        id: user.uid,
        email: user.email,
        name: user.name,
        createdAt: now,
        lastSeenAt: now
      });

      return next();
    } catch (error) {
      return res.status(401).json({
        status: "error",
        message: "Token inválido."
      });
    }
  };
}

