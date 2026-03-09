import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/httpError.js";

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof HttpError) {
    return res.status(error.statusCode).json({
      status: "error",
      message: error.message,
      details: error.details ?? null
    });
  }

  console.error(error);
  return res.status(500).json({
    status: "error",
    message: "Erro interno no servidor."
  });
}

