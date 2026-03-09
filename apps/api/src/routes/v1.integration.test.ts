import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { MemoryCaseRepository } from "../repositories/memoryCaseRepository.js";
import type { AppDependencies } from "../dependencies.js";
import type { AuthenticatedUser, AuthVerifier } from "../types/auth.js";
import type { CpfProvider } from "../services/cpfProvider.js";

class FakeAuthVerifier implements AuthVerifier {
  private readonly users: Record<string, AuthenticatedUser> = {
    "token-user-a": { uid: "user-a", email: "a@test.com", name: "Usuário A" },
    "token-user-b": { uid: "user-b", email: "b@test.com", name: "Usuário B" }
  };

  async verifyIdToken(token: string): Promise<AuthenticatedUser> {
    const user = this.users[token];
    if (!user) {
      throw new Error("invalid token");
    }
    return user;
  }
}

class FixedMockCpfProvider implements CpfProvider {
  async lookup(cpf: string) {
    return {
      cpf,
      nome: "Cliente Teste 0001",
      situacao: "regular" as const,
      source: "mock" as const,
      updatedAt: "2026-03-09T12:00:00.000Z"
    };
  }
}

function buildTestApp() {
  const repository = new MemoryCaseRepository();
  const deps: AppDependencies = {
    repository,
    authVerifier: new FakeAuthVerifier(),
    cpfProvider: new FixedMockCpfProvider()
  };

  return createApp(deps);
}

describe("v1 routes", () => {
  it("deve bloquear requisição sem token", async () => {
    const app = buildTestApp();

    const response = await request(app).get("/v1/cases");

    expect(response.status).toBe(401);
    expect(response.body.status).toBe("error");
  });

  it("deve criar e listar casos isolando por usuário", async () => {
    const app = buildTestApp();

    const createCaseA = await request(app)
      .post("/v1/cases")
      .set("Authorization", "Bearer token-user-a")
      .send({
        varaId: "jec-sp-capital",
        cpf: "935.411.347-80",
        resumo: "Problema em compra online sem solução amigável."
      });

    const createCaseB = await request(app)
      .post("/v1/cases")
      .set("Authorization", "Bearer token-user-b")
      .send({
        varaId: "jec-campinas",
        cpf: "111.444.777-35",
        resumo: "Cobrança indevida realizada em duplicidade."
      });

    expect(createCaseA.status).toBe(201);
    expect(createCaseB.status).toBe(201);

    const listA = await request(app)
      .get("/v1/cases")
      .set("Authorization", "Bearer token-user-a");

    const listB = await request(app)
      .get("/v1/cases")
      .set("Authorization", "Bearer token-user-b");

    expect(listA.status).toBe(200);
    expect(listB.status).toBe(200);
    expect(listA.body.result).toHaveLength(1);
    expect(listB.body.result).toHaveLength(1);
    expect(listA.body.result[0].userId).toBe("user-a");
    expect(listB.body.result[0].userId).toBe("user-b");
  });

  it("deve retornar contrato esperado na consulta CPF mock", async () => {
    const app = buildTestApp();

    const response = await request(app)
      .post("/v1/cpf/consulta")
      .set("Authorization", "Bearer token-user-a")
      .send({ cpf: "935.411.347-80" });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.body.result).toMatchObject({
      cpf: "93541134780",
      source: "mock"
    });
  });

  it("deve salvar perfil de usuário com CPF válido", async () => {
    const app = buildTestApp();

    const response = await request(app)
      .post("/v1/users/profile")
      .set("Authorization", "Bearer token-user-a")
      .send({
        cpf: "935.411.347-80",
        name: "Usuário A"
      });

    expect(response.status).toBe(200);
    expect(response.body.result).toMatchObject({
      id: "user-a",
      cpf: "93541134780"
    });
  });
});
