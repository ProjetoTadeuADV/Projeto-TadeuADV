import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/httpError.js";

function isPayloadTooLargeError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { type?: unknown; status?: unknown; statusCode?: unknown };
  return (
    candidate.type === "entity.too.large" ||
    candidate.status === 413 ||
    candidate.statusCode === 413
  );
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof HttpError) {
    return res.status(error.statusCode).json({
      status: "error",
      message: error.message,
      details: error.details ?? null
    });
  }

  if (isPayloadTooLargeError(error)) {
    return res.status(413).json({
      status: "error",
      message: "A imagem de perfil é muito grande. Envie uma imagem menor."
    });
  }

  console.error(error);
  return res.status(500).json({
    status: "error",
    message: "Erro interno no servidor."
  });
}
