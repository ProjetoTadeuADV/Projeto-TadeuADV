import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import type { AppDependencies } from "../dependencies.js";
import { MemoryCaseRepository } from "../repositories/memoryCaseRepository.js";
import type { CpfProvider } from "../services/cpfProvider.js";
import type { AuthenticatedUser, AuthVerifier } from "../types/auth.js";

class FakeAuthVerifier implements AuthVerifier {
  private readonly users: Record<string, AuthenticatedUser> = {
    "token-user-a": {
      uid: "user-a",
      email: "a@test.com",
      name: "Usuario A",
      emailVerified: true,
      isMaster: false,
      isBootstrapMaster: false
    },
    "token-user-b": {
      uid: "user-b",
      email: "b@test.com",
      name: "Usuario B",
      emailVerified: true,
      isMaster: false,
      isBootstrapMaster: false
    },
    "token-master": {
      uid: "master-user",
      email: "master@test.com",
      name: "Conta Master",
      emailVerified: true,
      isMaster: true,
      isBootstrapMaster: true
    }
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
  it("deve bloquear requisicao sem token", async () => {
    const app = buildTestApp();

    const response = await request(app).get("/v1/cases");

    expect(response.status).toBe(401);
    expect(response.body.status).toBe("error");
  });

  it("deve retornar sessao autenticada com papel master", async () => {
    const app = buildTestApp();

    const response = await request(app)
      .get("/v1/auth/session")
      .set("Authorization", "Bearer token-master");

    expect(response.status).toBe(200);
    expect(response.body.result).toMatchObject({
      uid: "master-user",
      isMaster: true,
      isBootstrapMaster: true
    });
  });

  it("deve criar e listar casos isolando por usuario", async () => {
    const app = buildTestApp();

    const createCaseA = await request(app)
      .post("/v1/cases")
      .set("Authorization", "Bearer token-user-a")
      .send({
        varaId: "jec-sp-capital",
        cpf: "935.411.347-80",
        resumo: "Problema em compra online sem solucao amigavel."
      });

    const createCaseB = await request(app)
      .post("/v1/cases")
      .set("Authorization", "Bearer token-user-b")
      .send({
        varaId: "jec-campinas",
        cpf: "111.444.777-35",
        resumo: "Cobranca indevida realizada em duplicidade."
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

  it("deve salvar perfil de usuario com CPF valido", async () => {
    const app = buildTestApp();

    const response = await request(app)
      .post("/v1/users/profile")
      .set("Authorization", "Bearer token-user-a")
      .send({
        cpf: "935.411.347-80",
        name: "Usuario A"
      });

    expect(response.status).toBe(200);
    expect(response.body.result).toMatchObject({
      id: "user-a",
      cpf: "93541134780"
    });
  });

  it("deve bloquear a visao geral para usuario comum", async () => {
    const app = buildTestApp();

    const response = await request(app)
      .get("/v1/admin/overview")
      .set("Authorization", "Bearer token-user-a");

    expect(response.status).toBe(403);
    expect(response.body.status).toBe("error");
  });

  it("deve permitir promover outro usuario para master e liberar o painel", async () => {
    const app = buildTestApp();

    await request(app)
      .post("/v1/users/profile")
      .set("Authorization", "Bearer token-user-a")
      .send({
        cpf: "935.411.347-80",
        name: "Usuario A"
      });

    const promoteResponse = await request(app)
      .patch("/v1/admin/users/user-a/master")
      .set("Authorization", "Bearer token-master")
      .send({
        isMaster: true
      });

    expect(promoteResponse.status).toBe(200);
    expect(promoteResponse.body.result).toMatchObject({
      id: "user-a",
      isMaster: true,
      isBootstrapMaster: false
    });

    const sessionResponse = await request(app)
      .get("/v1/auth/session")
      .set("Authorization", "Bearer token-user-a");

    expect(sessionResponse.status).toBe(200);
    expect(sessionResponse.body.result).toMatchObject({
      uid: "user-a",
      isMaster: true,
      isBootstrapMaster: false
    });

    const overviewResponse = await request(app)
      .get("/v1/admin/overview")
      .set("Authorization", "Bearer token-user-a");

    expect(overviewResponse.status).toBe(200);
    expect(overviewResponse.body.result.summary).toMatchObject({
      totalUsers: 2,
      totalMasterUsers: 2
    });
    expect(overviewResponse.body.result.users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "user-a",
          isMaster: true
        }),
        expect.objectContaining({
          id: "master-user",
          isMaster: true
        })
      ])
    );
  });

  it("deve impedir alterar a propria conta master pelo painel", async () => {
    const app = buildTestApp();

    const response = await request(app)
      .patch("/v1/admin/users/master-user/master")
      .set("Authorization", "Bearer token-master")
      .send({
        isMaster: false
      });

    expect(response.status).toBe(400);
    expect(response.body.status).toBe("error");
  });
});
