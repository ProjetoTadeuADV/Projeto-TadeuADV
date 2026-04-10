import express from "express";
import cors from "cors";
import { createV1Router } from "./routes/v1.js";
import { errorHandler } from "./middleware/errorHandler.js";
import type { AppDependencies } from "./dependencies.js";
import { createDefaultDependencies } from "./dependencies.js";
import { env } from "./config/env.js";
import "./types/request.js";

function normalizeOriginValue(value: string): string {
  const trimmed = value.trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function parseCorsOrigin(input: string): string[] {
  return input
    .split(",")
    .map((value) => normalizeOriginValue(value))
    .filter(Boolean);
}

function isWildcardOrigin(originPattern: string): boolean {
  return originPattern.includes("*.");
}

function matchWildcardOrigin(origin: string, originPattern: string): boolean {
  const normalizedOrigin = normalizeOriginValue(origin);
  const wildcardWithProtocol = originPattern.match(/^(https?:\/\/)\*\.(.+)$/i);
  if (wildcardWithProtocol) {
    const protocol = wildcardWithProtocol[1].toLowerCase();
    const domain = wildcardWithProtocol[2].toLowerCase();

    try {
      const parsed = new URL(normalizedOrigin);
      if (`${parsed.protocol}//`.toLowerCase() !== protocol) {
        return false;
      }

      const host = parsed.hostname.toLowerCase();
      return host === domain || host.endsWith(`.${domain}`);
    } catch {
      return false;
    }
  }

  const wildcardNoProtocol = originPattern.match(/^\*\.(.+)$/i);
  if (wildcardNoProtocol) {
    const domain = wildcardNoProtocol[1].toLowerCase();

    try {
      const parsed = new URL(normalizedOrigin);
      const host = parsed.hostname.toLowerCase();
      return host === domain || host.endsWith(`.${domain}`);
    } catch {
      return false;
    }
  }

  return false;
}

function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  const normalizedOrigin = normalizeOriginValue(origin);

  for (const allowedOrigin of allowedOrigins) {
    if (allowedOrigin === "*") {
      return true;
    }

    if (allowedOrigin === normalizedOrigin) {
      return true;
    }

    if (isWildcardOrigin(allowedOrigin) && matchWildcardOrigin(normalizedOrigin, allowedOrigin)) {
      return true;
    }
  }

  return false;
}

export function createApp(dependencies?: AppDependencies) {
  const deps = dependencies ?? createDefaultDependencies();
  const app = express();
  const origins = parseCorsOrigin(env.CORS_ORIGIN);
  const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      callback(null, isOriginAllowed(origin, origins));
    },
    credentials: false,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  };

  app.use(cors(corsOptions));
  app.options("*", cors(corsOptions));
  app.use(express.json({ limit: "2mb" }));

  app.use("/v1", createV1Router(deps));
  app.use(errorHandler);

  return app;
}
