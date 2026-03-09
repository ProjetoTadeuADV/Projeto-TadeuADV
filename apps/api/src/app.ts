import express from "express";
import cors from "cors";
import { createV1Router } from "./routes/v1.js";
import { errorHandler } from "./middleware/errorHandler.js";
import type { AppDependencies } from "./dependencies.js";
import { createDefaultDependencies } from "./dependencies.js";
import { env } from "./config/env.js";
import "./types/request.js";

function parseCorsOrigin(input: string): string[] {
  return input
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function createApp(dependencies?: AppDependencies) {
  const deps = dependencies ?? createDefaultDependencies();
  const app = express();
  const origins = parseCorsOrigin(env.CORS_ORIGIN);

  app.use(
    cors({
      origin: origins.includes("*") ? true : origins,
      credentials: false
    })
  );
  app.use(express.json());

  app.use("/v1", createV1Router(deps));
  app.use(errorHandler);

  return app;
}
