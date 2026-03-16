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
      avatarUrl: "https://cdn.test/avatar-a.png",
      emailVerified: true,
      isMaster: false,
      isOperator: false,
      isBootstrapMaster: false
    },
    "token-user-b": {
      uid: "user-b",
      email: "b@test.com",
      name: "Usuario B",
      avatarUrl: "https://cdn.test/avatar-b.png",
      emailVerified: true,
      isMaster: false,
      isOperator: false,
      isBootstrapMaster: false
    },
    "token-user-unverified": {
      uid: "user-unverified",
      email: "unverified@test.com",
      name: "Usuario Sem Verificacao",
      avatarUrl: null,
      emailVerified: false,
      isMaster: false,
      isOperator: false,
      isBootstrapMaster: false
    },
    "token-master": {
      uid: "master-user",
      email: "master@test.com",
      name: "Conta Master",
      avatarUrl: "https://cdn.test/avatar-master.png",
      emailVerified: true,
      isMaster: true,
      isOperator: false,
      isBootstrapMaster: true
    },
    "token-operator": {
      uid: "operator-user",
      email: "operator@test.com",
      name: "Conta Operador",
      avatarUrl: null,
      emailVerified: true,
      isMaster: false,
      isOperator: true,
      isBootstrapMaster: false
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

function parseBinaryResponse(res: any, callback: (error: Error | null, body: Buffer) => void) {
  const data: Buffer[] = [];
  res.on("data", (chunk: Buffer | string) => data.push(Buffer.from(chunk)));
  res.on("end", () => callback(null, Buffer.concat(data)));
  res.on("error", (error: Error) => callback(error, Buffer.alloc(0)));
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

  it("deve responder fallback quando envio customizado nao estiver configurado", async () => {
    const app = buildTestApp();

    const response = await request(app)
      .post("/v1/auth/verification-email")
      .set("Authorization", "Bearer token-user-unverified");

    expect(response.status).toBe(200);
    expect(response.body.result).toMatchObject({
      sent: false,
      reason: "custom-sender-not-configured"
    });
  });

  it("deve resolver login por CPF para e-mail cadastrado", async () => {
    const app = buildTestApp();

    await request(app)
      .post("/v1/users/profile")
      .set("Authorization", "Bearer token-user-a")
      .send({
        cpf: "935.411.347-80",
        name: "Usuario A"
      });

    const response = await request(app)
      .post("/v1/auth/resolve-login")
      .send({
        identifier: "935.411.347-80"
      });

    expect(response.status).toBe(200);
    expect(response.body.result).toMatchObject({
      email: "a@test.com"
    });
  });

  it("deve sinalizar CPF e e-mail ja cadastrados na validacao de registro", async () => {
    const app = buildTestApp();

    await request(app)
      .post("/v1/users/profile")
      .set("Authorization", "Bearer token-user-a")
      .send({
        cpf: "935.411.347-80",
        name: "Usuario A"
      });

    const response = await request(app)
      .post("/v1/auth/register-availability")
      .send({
        cpf: "935.411.347-80",
        email: "a@test.com"
      });

    expect(response.status).toBe(200);
    expect(response.body.result).toMatchObject({
      cpfInUse: true,
      emailInUse: true
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

  it("deve persistir dados estruturados da peticao no caso", async () => {
    const app = buildTestApp();

    const createCase = await request(app)
      .post("/v1/cases")
      .set("Authorization", "Bearer token-user-a")
      .send({
        varaId: "jec-sp-capital",
        cpf: "935.411.347-80",
        resumo: "Resumo da reclamacao com descricao objetiva para triagem.",
        petitionInitial: {
          claimantAddress: "Rua A, 100, Centro, Sao Paulo/SP",
          claimSubject: "Cobranca indevida",
          defendantType: "pessoa_juridica",
          defendantName: "Empresa XYZ",
          defendantDocument: "12.345.678/0001-90",
          defendantAddress: "Av. B, 200, Sao Paulo/SP",
          facts:
            "Foi identificada cobranca em duplicidade na fatura do cartao, sem estorno apos duas solicitacoes.",
          legalGrounds:
            "A cobranca indevida viola o CDC e gera dever de restituicao e reparacao pelos danos suportados.",
          requests: [
            "Restituicao em dobro dos valores cobrados indevidamente.",
            "Condenacao ao pagamento de danos morais."
          ],
          evidence: "Faturas e protocolos de atendimento anexos.",
          claimValue: 3800,
          hearingInterest: true
        }
      });

    expect(createCase.status).toBe(201);
    expect(createCase.body.result.petitionInitial).toMatchObject({
      claimSubject: "Cobranca indevida",
      defendantName: "Empresa XYZ",
      defendantDocument: "12345678000190",
      requests: [
        "Restituicao em dobro dos valores cobrados indevidamente.",
        "Condenacao ao pagamento de danos morais."
      ]
    });

    const caseId = createCase.body.result.id as string;
    const getCase = await request(app)
      .get(`/v1/cases/${caseId}`)
      .set("Authorization", "Bearer token-user-a");

    expect(getCase.status).toBe(200);
    expect(getCase.body.result.petitionInitial).toMatchObject({
      claimSubject: "Cobranca indevida",
      defendantType: "pessoa_juridica",
      attachments: [],
      hearingInterest: true
    });
  });

  it("deve permitir anexar arquivos ao caso e baixar anexo salvo", async () => {
    const app = buildTestApp();

    const createCase = await request(app)
      .post("/v1/cases")
      .set("Authorization", "Bearer token-user-a")
      .send({
        varaId: "jec-sp-capital",
        cpf: "935.411.347-80",
        resumo: "Resumo da reclamacao com descricao suficiente para teste de anexos.",
        petitionInitial: {
          claimantAddress: "Rua A, 100, Centro, Sao Paulo/SP",
          claimSubject: "Entrega nao realizada",
          defendantType: "pessoa_juridica",
          defendantName: "Empresa XYZ",
          defendantDocument: "12.345.678/0001-90",
          defendantAddress: "Av. B, 200, Sao Paulo/SP",
          facts:
            "O consumidor nao recebeu o produto dentro do prazo e nao obteve solucao no atendimento administrativo.",
          legalGrounds:
            "Ha falha na prestacao do servico e responsabilidade objetiva do fornecedor pelos danos causados.",
          requests: ["Entrega imediata do produto ou devolucao integral do valor pago."],
          evidence: "Conversas e comprovantes do pedido.",
          claimValue: 1299.9,
          hearingInterest: true
        }
      });

    expect(createCase.status).toBe(201);
    const caseId = createCase.body.result.id as string;

    const uploadResponse = await request(app)
      .post(`/v1/cases/${caseId}/attachments`)
      .set("Authorization", "Bearer token-user-a")
      .attach("attachments", Buffer.from("conteudo de teste do anexo"), "comprovante.txt");

    expect(uploadResponse.status).toBe(200);
    expect(uploadResponse.body.result.petitionInitial.attachments).toHaveLength(1);

    const [savedAttachment] = uploadResponse.body.result.petitionInitial.attachments as Array<{
      id: string;
      originalName: string;
      mimeType: string;
    }>;
    expect(savedAttachment).toMatchObject({
      originalName: "comprovante.txt",
      mimeType: "text/plain"
    });

    const downloadResponse = await request(app)
      .get(`/v1/cases/${caseId}/attachments/${savedAttachment.id}`)
      .set("Authorization", "Bearer token-user-a")
      .buffer(true)
      .parse(parseBinaryResponse);

    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers["content-type"]).toContain("text/plain");
    expect(Buffer.isBuffer(downloadResponse.body)).toBe(true);
    expect(downloadResponse.body.toString("utf-8")).toContain("conteudo de teste do anexo");
  });

  it("deve permitir ao perfil admin listar e consultar casos de todos os clientes", async () => {
    const app = buildTestApp();

    await request(app)
      .post("/v1/cases")
      .set("Authorization", "Bearer token-user-a")
      .send({
        varaId: "jec-sp-capital",
        cpf: "935.411.347-80",
        resumo: "Primeiro caso para visao administrativa."
      });

    const caseB = await request(app)
      .post("/v1/cases")
      .set("Authorization", "Bearer token-user-b")
      .send({
        varaId: "jec-campinas",
        cpf: "111.444.777-35",
        resumo: "Segundo caso para visao administrativa."
      });

    const listMaster = await request(app)
      .get("/v1/cases")
      .set("Authorization", "Bearer token-master");

    expect(listMaster.status).toBe(200);
    expect(listMaster.body.result).toHaveLength(2);
    expect(listMaster.body.result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: "user-a",
          responsavelEmail: "a@test.com",
          clienteNome: "Cliente Teste 0001"
        }),
        expect.objectContaining({
          userId: "user-b",
          responsavelEmail: "b@test.com",
          clienteNome: "Cliente Teste 0001"
        })
      ])
    );

    const caseId = caseB.body.result.id as string;
    const getMasterCase = await request(app)
      .get(`/v1/cases/${caseId}`)
      .set("Authorization", "Bearer token-master");

    expect(getMasterCase.status).toBe(200);
    expect(getMasterCase.body.result).toMatchObject({
      id: caseId,
      userId: "user-b",
      responsavelEmail: "b@test.com",
      clienteNome: "Cliente Teste 0001"
    });
  });

  it("deve gerar PDF da peticao inicial para o usuario autenticado", async () => {
    const app = buildTestApp();

    const createCase = await request(app)
      .post("/v1/cases")
      .set("Authorization", "Bearer token-user-a")
      .send({
        varaId: "jec-sp-capital",
        cpf: "935.411.347-80",
        resumo: "Cliente relata cobranca indevida recorrente sem solucao administrativa."
      });

    expect(createCase.status).toBe(201);
    const caseId = createCase.body.result.id as string;

    const pdfResponse = await request(app)
      .get(`/v1/cases/${caseId}/peticao-inicial.pdf`)
      .set("Authorization", "Bearer token-user-a");

    expect(pdfResponse.status).toBe(200);
    expect(pdfResponse.headers["content-type"]).toContain("application/pdf");
    expect(pdfResponse.headers["content-disposition"]).toContain("peticao-inicial");

    const bodyBuffer = Buffer.isBuffer(pdfResponse.body)
      ? pdfResponse.body
      : Buffer.from(pdfResponse.text ?? "", "binary");
    expect(bodyBuffer.length).toBeGreaterThan(500);
    expect(bodyBuffer.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
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

  it("deve impedir cadastro de CPF duplicado em outra conta", async () => {
    const app = buildTestApp();

    await request(app)
      .post("/v1/users/profile")
      .set("Authorization", "Bearer token-user-a")
      .send({
        cpf: "935.411.347-80",
        name: "Usuario A"
      });

    const response = await request(app)
      .post("/v1/users/profile")
      .set("Authorization", "Bearer token-user-b")
      .send({
        cpf: "935.411.347-80",
        name: "Usuario B"
      });

    expect(response.status).toBe(409);
    expect(response.body.status).toBe("error");
  });

  it("deve retornar e atualizar perfil da conta autenticada", async () => {
    const app = buildTestApp();

    const getResponse = await request(app)
      .get("/v1/users/me")
      .set("Authorization", "Bearer token-user-a");

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.result.user).toMatchObject({
      id: "user-a",
      firebaseUid: "user-a",
      email: "a@test.com",
      name: "Usuario A"
    });

    const patchResponse = await request(app)
      .patch("/v1/users/me")
      .set("Authorization", "Bearer token-user-a")
      .send({
        name: "Usuario A Editado",
        avatarUrl: "   "
      });

    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body.result.user).toMatchObject({
      id: "user-a",
      name: "Usuario A Editado",
      avatarUrl: null
    });

    const secondGetResponse = await request(app)
      .get("/v1/users/me")
      .set("Authorization", "Bearer token-user-a");

    expect(secondGetResponse.status).toBe(200);
    expect(secondGetResponse.body.result.user).toMatchObject({
      name: "Usuario A Editado",
      avatarUrl: null
    });
  });

  it("deve validar payload vazio na atualizacao de perfil da conta", async () => {
    const app = buildTestApp();

    const response = await request(app)
      .patch("/v1/users/me")
      .set("Authorization", "Bearer token-user-a")
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.status).toBe("error");
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

  it("deve permitir definir usuario como operador com leitura no admin e abertura de caso", async () => {
    const app = buildTestApp();

    await request(app)
      .get("/v1/auth/session")
      .set("Authorization", "Bearer token-user-b");

    const promoteToOperator = await request(app)
      .patch("/v1/admin/users/user-b/access")
      .set("Authorization", "Bearer token-master")
      .send({
        accessLevel: "operator"
      });

    expect(promoteToOperator.status).toBe(200);
    expect(promoteToOperator.body.result).toMatchObject({
      id: "user-b",
      accessLevel: "operator",
      isMaster: false,
      isOperator: true
    });

    const sessionResponse = await request(app)
      .get("/v1/auth/session")
      .set("Authorization", "Bearer token-user-b");

    expect(sessionResponse.status).toBe(200);
    expect(sessionResponse.body.result).toMatchObject({
      uid: "user-b",
      isMaster: false,
      isOperator: true
    });

    const overviewResponse = await request(app)
      .get("/v1/admin/overview")
      .set("Authorization", "Bearer token-user-b");

    expect(overviewResponse.status).toBe(200);

    const forbiddenMutation = await request(app)
      .patch("/v1/admin/users/user-a/access")
      .set("Authorization", "Bearer token-user-b")
      .send({
        accessLevel: "master"
      });

    expect(forbiddenMutation.status).toBe(403);

    const createCaseAsOperator = await request(app)
      .post("/v1/cases")
      .set("Authorization", "Bearer token-user-b")
      .send({
        varaId: "jec-campinas",
        cpf: "111.444.777-35",
        resumo: "Operador pode criar requisicoes durante a fase de testes."
      });

    expect(createCaseAsOperator.status).toBe(201);

    const cpfLookupAsOperator = await request(app)
      .post("/v1/cpf/consulta")
      .set("Authorization", "Bearer token-user-b")
      .send({
        cpf: "111.444.777-35"
      });

    expect(cpfLookupAsOperator.status).toBe(200);
  });

  it("deve permitir usuario excluir a propria conta e casos", async () => {
    const app = buildTestApp();

    const createCaseResponse = await request(app)
      .post("/v1/cases")
      .set("Authorization", "Bearer token-user-a")
      .send({
        varaId: "jec-sp-capital",
        cpf: "935.411.347-80",
        resumo: "Caso para validar exclusao da propria conta."
      });

    expect(createCaseResponse.status).toBe(201);

    const deleteResponse = await request(app)
      .delete("/v1/users/me")
      .set("Authorization", "Bearer token-user-a");

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.result).toMatchObject({
      deletedUserId: "user-a",
      deletedCases: 1
    });

    const overviewResponse = await request(app)
      .get("/v1/admin/overview")
      .set("Authorization", "Bearer token-master");

    expect(overviewResponse.status).toBe(200);
    expect(overviewResponse.body.result.users).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "user-a" })])
    );
  });

  it("deve permitir master excluir outro usuario", async () => {
    const app = buildTestApp();

    const createCaseResponse = await request(app)
      .post("/v1/cases")
      .set("Authorization", "Bearer token-user-b")
      .send({
        varaId: "jec-campinas",
        cpf: "111.444.777-35",
        resumo: "Caso para validar exclusao pelo administrador."
      });

    expect(createCaseResponse.status).toBe(201);

    const deleteResponse = await request(app)
      .delete("/v1/admin/users/user-b")
      .set("Authorization", "Bearer token-master");

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.result).toMatchObject({
      deletedUserId: "user-b",
      deletedCases: 1
    });
  });
});
