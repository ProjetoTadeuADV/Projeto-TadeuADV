import { Router } from "express";
import { VARAS } from "../constants/varas.js";
import { authMiddleware } from "../middleware/auth.js";
import type { AppDependencies } from "../dependencies.js";
import {
  validateCreateCaseInput,
  validateCpfLookupPayload,
  validateUserProfilePayload
} from "../services/caseInput.js";
import { HttpError } from "../utils/httpError.js";

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

  return router;
}
