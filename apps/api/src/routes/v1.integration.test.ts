import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import type { AppDependencies } from "../dependencies.js";
import { MemoryCaseRepository } from "../repositories/memoryCaseRepository.js";
import type {
  BillingBoletoInput,
  BillingBoletoResult,
  BillingCustomerInput,
  BillingCustomerResult,
  BillingProvider
} from "../services/asaasProvider.js";
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

class FakeBillingProvider implements BillingProvider {
  private customerCount = 0;
  private paymentCount = 0;

  isConfigured(): boolean {
    return false;
  }

  async ensureCustomer(input: BillingCustomerInput): Promise<BillingCustomerResult> {
    this.customerCount += 1;
    return {
      customerId: input.existingCustomerId ?? `cus_test_${this.customerCount}`,
      liveMode: false
    };
  }

  async createBoleto(input: BillingBoletoInput): Promise<BillingBoletoResult> {
    this.paymentCount += 1;
    return {
      paymentId: `pay_test_${this.paymentCount}`,
      status: "PENDING",
      invoiceUrl: null,
      bankSlipUrl: null,
      attachment: {
        fileName: `boleto-${input.caseCode}.txt`,
        mimeType: "text/plain",
        bytes: Buffer.from("boleto teste", "utf-8")
      },
      liveMode: false
    };
  }
}

function buildTestApp() {
  const repository = new MemoryCaseRepository();
  const deps: AppDependencies = {
    repository,
    authVerifier: new FakeAuthVerifier(),
    cpfProvider: new FixedMockCpfProvider(),
    paymentProvider: new FakeBillingProvider()
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
    expect(createCaseA.body.result.caseCode).toMatch(/^CASO-\d{8}-[A-F0-9]{8}$/);
    expect(createCaseB.body.result.caseCode).toMatch(/^CASO-\d{8}-[A-F0-9]{8}$/);
    expect(createCaseA.body.result.caseCode).not.toBe(createCaseB.body.result.caseCode);

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
          timelineEvents: [
            {
              eventDate: "2026-02-01",
              description: "Compra concluida pela plataforma da reclamada."
            },
            {
              eventDate: "2026-02-06",
              description: "Reclamacao administrativa registrada sem solucao."
            }
          ],
          pretensions: [
            {
              type: "ressarcimento_valor",
              amount: 3800,
              details: "Reembolso dos valores pagos indevidamente."
            },
            {
              type: "indenizacao_danos",
              amount: 2500,
              details: "Compensacao pelos danos morais."
            }
          ],
          evidence: "Faturas e protocolos de atendimento anexos.",
          claimValue: 3800,
          hearingInterest: true
        }
      });

    expect(createCase.status).toBe(201);
    const createdPetitionInitial = createCase.body.result.petitionInitial as {
      claimSubject: string;
      defendantName: string;
      defendantDocument: string;
      claimValue: number;
      timelineEvents: Array<{ eventDate: string }>;
      pretensions: Array<{ type: string }>;
      requests: string[];
    };
    expect(createdPetitionInitial).toMatchObject({
      claimSubject: "Cobranca indevida",
      defendantName: "Empresa XYZ",
      defendantDocument: "12345678000190",
      claimValue: 6300,
      requests: [
        "Restituicao em dobro dos valores cobrados indevidamente.",
        "Condenacao ao pagamento de danos morais."
      ]
    });
    expect(createdPetitionInitial.timelineEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventDate: "2026-02-01"
        })
      ])
    );
    expect(createdPetitionInitial.pretensions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "ressarcimento_valor"
        })
      ])
    );

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
          timelineEvents: [
            {
              eventDate: "2026-01-25",
              description: "Pedido confirmado com prazo de entrega informado."
            },
            {
              eventDate: "2026-02-03",
              description: "Prazo encerrado sem entrega do produto."
            }
          ],
          pretensions: [
            {
              type: "devolucao_produto",
              amount: 1299.9,
              details: "Devolucao do valor e cancelamento da compra."
            }
          ],
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
          clienteNome: "Usuario A"
        }),
        expect.objectContaining({
          userId: "user-b",
          responsavelEmail: "b@test.com",
          clienteNome: "Usuario B"
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
      clienteNome: "Usuario B"
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

  it("deve permitir salvar dados opcionais do perfil da conta", async () => {
    const app = buildTestApp();

    const patchResponse = await request(app)
      .patch("/v1/users/me")
      .set("Authorization", "Bearer token-user-a")
      .send({
        cpf: "935.411.347-80",
        rg: "12.345.678-9",
        rgIssuer: "SSP/SP",
        birthDate: "1990-05-17",
        maritalStatus: "Casado(a)",
        profession: "Analista de sistemas",
        address: {
          cep: "01001-000",
          street: "Praca da Se",
          number: "100",
          complement: "Sala 12",
          neighborhood: "Se",
          city: "Sao Paulo",
          state: "SP"
        }
      });

    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body.result.user).toMatchObject({
      cpf: "93541134780",
      rg: "12.345.678-9",
      rgIssuer: "SSP/SP",
      birthDate: "1990-05-17",
      maritalStatus: "Casado(a)",
      profession: "Analista de sistemas",
      address: {
        cep: "01001000",
        street: "Praca da Se",
        number: "100",
        complement: "Sala 12",
        neighborhood: "Se",
        city: "Sao Paulo",
        state: "SP"
      }
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

  it("deve permitir alocar caso para operador e registrar movimentacao publica", async () => {
    const app = buildTestApp();

    const createCase = await request(app)
      .post("/v1/cases")
      .set("Authorization", "Bearer token-user-a")
      .send({
        varaId: "jec-sp-capital",
        cpf: "935.411.347-80",
        resumo: "Caso para validar alocacao e movimentacao por operador."
      });

    expect(createCase.status).toBe(201);
    const caseId = createCase.body.result.id as string;

    await request(app)
      .get("/v1/auth/session")
      .set("Authorization", "Bearer token-operator");

    const assignResponse = await request(app)
      .post(`/v1/cases/${caseId}/assign-operator`)
      .set("Authorization", "Bearer token-master")
      .send({
        operatorUserId: "operator-user"
      });

    expect(assignResponse.status).toBe(200);
    expect(assignResponse.body.result).toMatchObject({
      id: caseId,
      assignedOperatorId: "operator-user"
    });

    const movementResponse = await request(app)
      .post(`/v1/cases/${caseId}/movements`)
      .set("Authorization", "Bearer token-operator")
      .send({
        stage: "conciliacao",
        description: "Proposta de acordo enviada para a parte reclamada com prazo de cinco dias.",
        visibility: "public",
        status: "em_analise"
      });

    expect(movementResponse.status).toBe(201);
    expect(movementResponse.body.result.movement).toMatchObject({
      stage: "conciliacao",
      visibility: "public",
      statusAfter: "em_analise"
    });

    const userGetCase = await request(app)
      .get(`/v1/cases/${caseId}`)
      .set("Authorization", "Bearer token-user-a");

    expect(userGetCase.status).toBe(200);
    expect(userGetCase.body.result.movements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: "conciliacao",
          visibility: "public"
        })
      ])
    );
  });

  it("deve impedir operador de alocar caso quando nao for master", async () => {
    const app = buildTestApp();

    const createCase = await request(app)
      .post("/v1/cases")
      .set("Authorization", "Bearer token-user-a")
      .send({
        varaId: "jec-sp-capital",
        cpf: "935.411.347-80",
        resumo: "Caso para validar restricao de alocacao por operador."
      });

    expect(createCase.status).toBe(201);
    const caseId = createCase.body.result.id as string;

    await request(app)
      .get("/v1/auth/session")
      .set("Authorization", "Bearer token-operator");

    const assignByOperator = await request(app)
      .post(`/v1/cases/${caseId}/assign-operator`)
      .set("Authorization", "Bearer token-operator")
      .send({
        operatorUserId: "operator-user"
      });

    expect(assignByOperator.status).toBe(403);
    expect(assignByOperator.body.message).toContain("Somente usuários master");
  });

  it("deve permitir parecer do operador, mensagens e configuracao de taxa inicial", async () => {
    const app = buildTestApp();

    const createCase = await request(app)
      .post("/v1/cases")
      .set("Authorization", "Bearer token-user-a")
      .send({
        varaId: "jec-sp-capital",
        cpf: "935.411.347-80",
        resumo: "Caso para validar fluxo de parecer, mensagens e taxa inicial."
      });

    expect(createCase.status).toBe(201);
    const caseId = createCase.body.result.id as string;

    await request(app)
      .get("/v1/auth/session")
      .set("Authorization", "Bearer token-operator");

    const assignResponse = await request(app)
      .post(`/v1/cases/${caseId}/assign-operator`)
      .set("Authorization", "Bearer token-master")
      .send({
        operatorUserId: "operator-user"
      });

    expect(assignResponse.status).toBe(200);

    const reviewResponse = await request(app)
      .post(`/v1/cases/${caseId}/review`)
      .set("Authorization", "Bearer token-operator")
      .send({
        decision: "accepted",
        reason: "Caso com elementos suficientes para prosseguir nesta etapa.",
        requestClientData: true,
        clientDataRequest: "Enviar comprovante de pagamento e nota fiscal."
      });

    expect(reviewResponse.status).toBe(200);
    expect(reviewResponse.body.result).toMatchObject({
      id: caseId,
      reviewDecision: "accepted",
      workflowStep: "awaiting_client_data",
      clientDataRequest: "Enviar comprovante de pagamento e nota fiscal."
    });

    const clientMessageResponse = await request(app)
      .post(`/v1/cases/${caseId}/messages`)
      .set("Authorization", "Bearer token-user-a")
      .field("message", "Segue os documentos solicitados para continuidade.")
      .attach("attachments", Buffer.from("conteudo do documento solicitado"), "documento-cliente.txt");

    expect(clientMessageResponse.status).toBe(201);
    expect(clientMessageResponse.body.result.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          senderRole: "client",
          attachments: expect.arrayContaining([
            expect.objectContaining({
              originalName: "documento-cliente.txt"
            })
          ])
        })
      ])
    );

    const messageItem = clientMessageResponse.body.result.messages.find(
      (item: { senderRole: string }) => item.senderRole === "client"
    ) as { id: string; attachments: Array<{ id: string }> } | undefined;
    if (!messageItem || messageItem.attachments.length === 0) {
      throw new Error("Mensagem do cliente sem anexos para download.");
    }

    const downloadMessageAttachment = await request(app)
      .get(
        `/v1/cases/${caseId}/messages/${messageItem.id}/attachments/${messageItem.attachments[0].id}`
      )
      .set("Authorization", "Bearer token-user-a")
      .buffer(true)
      .parse(parseBinaryResponse);

    expect(downloadMessageAttachment.status).toBe(200);
    expect(downloadMessageAttachment.body.toString("utf-8")).toContain("conteudo do documento solicitado");

    const feeResponse = await request(app)
      .post(`/v1/cases/${caseId}/service-fee`)
      .set("Authorization", "Bearer token-operator")
      .send({
        amount: 180,
        dueDate: "2026-03-25"
      });

    expect(feeResponse.status).toBe(200);
    expect(feeResponse.body.result).toMatchObject({
      workflowStep: "awaiting_initial_fee",
      serviceFee: {
        amount: 180,
        dueDate: "2026-03-25",
        provider: "asaas",
        status: "awaiting_payment"
      }
    });
  });

  it("deve bloquear novas edicoes operacionais apos rejeicao do caso", async () => {
    const app = buildTestApp();

    const createCase = await request(app)
      .post("/v1/cases")
      .set("Authorization", "Bearer token-user-a")
      .send({
        varaId: "jec-sp-capital",
        cpf: "935.411.347-80",
        resumo: "Caso para validar bloqueio de edicao apos rejeicao."
      });

    expect(createCase.status).toBe(201);
    const caseId = createCase.body.result.id as string;

    await request(app)
      .get("/v1/auth/session")
      .set("Authorization", "Bearer token-operator");

    const assignResponse = await request(app)
      .post(`/v1/cases/${caseId}/assign-operator`)
      .set("Authorization", "Bearer token-master")
      .send({
        operatorUserId: "operator-user"
      });

    expect(assignResponse.status).toBe(200);

    const rejectResponse = await request(app)
      .post(`/v1/cases/${caseId}/review`)
      .set("Authorization", "Bearer token-operator")
      .send({
        decision: "rejected",
        reason: "Documentos insuficientes e ausência de elementos mínimos para continuidade."
      });

    expect(rejectResponse.status).toBe(200);
    expect(rejectResponse.body.result).toMatchObject({
      reviewDecision: "rejected",
      workflowStep: "closed",
      status: "encerrado"
    });

    const movementAfterReject = await request(app)
      .post(`/v1/cases/${caseId}/movements`)
      .set("Authorization", "Bearer token-operator")
      .send({
        stage: "andamento",
        description: "Tentativa indevida de movimentacao apos rejeicao.",
        visibility: "public",
        status: "em_analise"
      });

    expect(movementAfterReject.status).toBe(409);

    const feeAfterReject = await request(app)
      .post(`/v1/cases/${caseId}/service-fee`)
      .set("Authorization", "Bearer token-operator")
      .send({
        amount: 120,
        dueDate: "2026-03-30"
      });

    expect(feeAfterReject.status).toBe(409);

    const reassignAfterReject = await request(app)
      .post(`/v1/cases/${caseId}/assign-operator`)
      .set("Authorization", "Bearer token-master")
      .send({
        operatorUserId: "operator-user"
      });

    expect(reassignAfterReject.status).toBe(409);
  });

  it("deve bloquear envio de mensagens por operador nao alocado ao caso", async () => {
    const app = buildTestApp();

    const createCase = await request(app)
      .post("/v1/cases")
      .set("Authorization", "Bearer token-user-a")
      .send({
        varaId: "jec-sp-capital",
        cpf: "935.411.347-80",
        resumo: "Caso para validar restricao de chat para operador nao alocado."
      });

    expect(createCase.status).toBe(201);
    const caseId = createCase.body.result.id as string;

    const operatorMessage = await request(app)
      .post(`/v1/cases/${caseId}/messages`)
      .set("Authorization", "Bearer token-operator")
      .send({
        message: "Tentativa de envio sem alocacao."
      });

    expect(operatorMessage.status).toBe(403);
  });

  it("deve ocultar movimentacao interna para o cliente e permitir download de anexo publico", async () => {
    const app = buildTestApp();

    const createCase = await request(app)
      .post("/v1/cases")
      .set("Authorization", "Bearer token-user-a")
      .send({
        varaId: "jec-sp-capital",
        cpf: "935.411.347-80",
        resumo: "Caso para validar visibilidade de movimentacoes e anexos."
      });

    expect(createCase.status).toBe(201);
    const caseId = createCase.body.result.id as string;

    await request(app)
      .get("/v1/auth/session")
      .set("Authorization", "Bearer token-operator");

    const assignResponse = await request(app)
      .post(`/v1/cases/${caseId}/assign-operator`)
      .set("Authorization", "Bearer token-master")
      .send({
        operatorUserId: "operator-user"
      });

    expect(assignResponse.status).toBe(200);

    const internalMovement = await request(app)
      .post(`/v1/cases/${caseId}/movements`)
      .set("Authorization", "Bearer token-operator")
      .send({
        stage: "andamento",
        description: "Anotacao interna de estrategia para audiencia de conciliacao.",
        visibility: "internal",
        status: "em_analise"
      });

    expect(internalMovement.status).toBe(201);

    const publicMovement = await request(app)
      .post(`/v1/cases/${caseId}/movements`)
      .set("Authorization", "Bearer token-operator")
      .send({
        stage: "protocolo",
        description: "Documento de protocolo juntado ao caso para consulta da parte autora.",
        visibility: "public",
        status: "em_analise"
      });

    expect(publicMovement.status).toBe(201);
    const publicMovementId = publicMovement.body.result.movement.id as string;

    const uploadMovementAttachment = await request(app)
      .post(`/v1/cases/${caseId}/movements/${publicMovementId}/attachments`)
      .set("Authorization", "Bearer token-operator")
      .attach("attachments", Buffer.from("arquivo publico do movimento"), "movimento-publico.txt");

    expect(uploadMovementAttachment.status).toBe(200);

    const userGetCase = await request(app)
      .get(`/v1/cases/${caseId}`)
      .set("Authorization", "Bearer token-user-a");

    expect(userGetCase.status).toBe(200);
    expect(userGetCase.body.result.movements).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({
          visibility: "internal"
        })
      ])
    );
    expect(userGetCase.body.result.movements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: publicMovementId,
          visibility: "public"
        })
      ])
    );

    const movementFromUserView = userGetCase.body.result.movements.find(
      (item: { id: string }) => item.id === publicMovementId
    ) as { attachments: Array<{ id: string }> } | undefined;
    if (!movementFromUserView || movementFromUserView.attachments.length === 0) {
      throw new Error("Movimentação pública sem anexos para download.");
    }
    const movementAttachmentId = movementFromUserView.attachments[0].id;

    const downloadMovementAttachment = await request(app)
      .get(`/v1/cases/${caseId}/movements/${publicMovementId}/attachments/${movementAttachmentId}`)
      .set("Authorization", "Bearer token-user-a")
      .buffer(true)
      .parse(parseBinaryResponse);

    expect(downloadMovementAttachment.status).toBe(200);
    expect(downloadMovementAttachment.body.toString("utf-8")).toContain("arquivo publico do movimento");
  });

  it("deve listar operadores para alocacao manual no painel", async () => {
    const app = buildTestApp();

    await request(app)
      .get("/v1/auth/session")
      .set("Authorization", "Bearer token-master");

    await request(app)
      .get("/v1/auth/session")
      .set("Authorization", "Bearer token-operator");

    const response = await request(app)
      .get("/v1/admin/operators")
      .set("Authorization", "Bearer token-master");

    expect(response.status).toBe(200);
    expect(response.body.result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "master-user",
          isMaster: true
        }),
        expect.objectContaining({
          id: "operator-user",
          isOperator: true
        })
      ])
    );
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
