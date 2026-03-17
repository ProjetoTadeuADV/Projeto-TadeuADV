import { describe, expect, it } from "vitest";
import {
  validateAccountProfilePatchPayload,
  validateAssignOperatorPayload,
  validateCaseMessagePayload,
  validateCaseMovementPayload,
  validateCaseReviewPayload,
  validateCaseServiceFeePayload,
  validateCreateCaseInput,
  validateRegisterAvailabilityPayload
} from "./caseInput.js";
import { CASE_STATUS_LABELS, isCaseStatus } from "../types/case.js";

describe("validateCreateCaseInput", () => {
  it("deve validar payload valido e normalizar CPF", () => {
    const parsed = validateCreateCaseInput({
      varaId: "jec-sp-capital",
      cpf: "935.411.347-80",
      resumo: "Compra nao entregue no prazo e sem retorno do fornecedor."
    });

    expect(parsed.cpf).toBe("93541134780");
    expect(parsed.varaNome).toBe("JEC SP Capital");
    expect(parsed.petitionInitial).toBeNull();
  });

  it("deve validar dados estruturados da peticao inicial", () => {
    const parsed = validateCreateCaseInput({
      varaId: "jec-sp-capital",
      cpf: "935.411.347-80",
      resumo: "Resumo da reclamacao com contexto suficiente para triagem inicial.",
      petitionInitial: {
        claimantAddress: "Rua das Flores, 123, Centro, Sao Paulo/SP",
        claimSubject: "Cobranca indevida",
        defendantType: "pessoa_juridica",
        defendantName: "Empresa XYZ",
        defendantDocument: "12.345.678/0001-90",
        defendantAddress: "Av. Paulista, 1000, Sao Paulo/SP",
        facts: "A empresa realizou cobranca duplicada em cartao de credito sem estorno apos contato administrativo.",
        legalGrounds:
          "A pratica configura cobranca indevida e violacao aos deveres de boa-fe objetiva e informacao.",
        requests: [
          "Restituicao em dobro dos valores cobrados indevidamente.",
          "Condenacao em danos morais em valor a ser arbitrado."
        ],
        timelineEvents: [
          {
            eventDate: "2026-02-01",
            description: "Compra realizada no site da reclamada."
          },
          {
            eventDate: "2026-02-05",
            description: "Produto entregue de forma divergente da oferta."
          }
        ],
        pretensions: [
          {
            type: "ressarcimento_valor",
            amount: 2500.5,
            details: "Reembolso integral do valor pago."
          }
        ],
        evidence: "Faturas, comprovantes de pagamento e protocolos de atendimento.",
        claimValue: 2500.5,
        hearingInterest: true
      }
    });

    expect(parsed.petitionInitial).toMatchObject({
      defendantType: "pessoa_juridica",
      defendantDocument: "12345678000190",
      claimSubject: "Cobranca indevida",
      attachments: [],
      timelineEvents: [
        {
          eventDate: "2026-02-01",
          description: "Compra realizada no site da reclamada."
        },
        {
          eventDate: "2026-02-05",
          description: "Produto entregue de forma divergente da oferta."
        }
      ],
      pretensions: [
        {
          type: "ressarcimento_valor",
          amount: 2500.5,
          details: "Reembolso integral do valor pago."
        }
      ],
      requests: [
        "Restituicao em dobro dos valores cobrados indevidamente.",
        "Condenacao em danos morais em valor a ser arbitrado."
      ]
    });
  });

  it("deve lancar erro para vara invalida", () => {
    expect(() =>
      validateCreateCaseInput({
        varaId: "vara-invalida",
        cpf: "93541134780",
        resumo: "Resumo com tamanho suficiente para passar no schema."
      })
    ).toThrowError(/Vara/);
  });

  it("deve rejeitar documento invalido da reclamada", () => {
    expect(() =>
      validateCreateCaseInput({
        varaId: "jec-sp-capital",
        cpf: "93541134780",
        resumo: "Resumo com tamanho suficiente para passar no schema.",
        petitionInitial: {
          claimantAddress: "Rua das Flores, 123, Centro, Sao Paulo/SP",
          claimSubject: "Cobranca indevida",
          defendantType: "pessoa_juridica",
          defendantName: "Empresa XYZ",
          defendantDocument: "12345678901",
          facts:
            "A empresa realizou cobranca duplicada em cartao de credito sem estorno apos contato administrativo.",
          legalGrounds:
            "A pratica configura cobranca indevida e violacao aos deveres de boa-fe objetiva e informacao.",
          requests: ["Restituicao em dobro dos valores cobrados indevidamente."],
          timelineEvents: [
            {
              eventDate: "2026-02-01",
              description: "Compra realizada no site da reclamada."
            }
          ],
          hearingInterest: true
        }
      })
    ).toThrowError(/Documento da reclamada/);
  });
});

describe("Case status mapping", () => {
  it("deve reconhecer status validos e labels", () => {
    expect(isCaseStatus("recebido")).toBe(true);
    expect(isCaseStatus("desconhecido")).toBe(false);
    expect(CASE_STATUS_LABELS.recebido).toBe("Recebido");
  });
});

describe("validateRegisterAvailabilityPayload", () => {
  it("deve normalizar CPF e e-mail para validacao de cadastro", () => {
    const parsed = validateRegisterAvailabilityPayload({
      cpf: "935.411.347-80",
      email: "USUARIO@EXEMPLO.COM"
    });

    expect(parsed).toEqual({
      cpf: "93541134780",
      email: "usuario@exemplo.com"
    });
  });
});

describe("validateAssignOperatorPayload", () => {
  it("deve validar o operador informado para alocação", () => {
    const parsed = validateAssignOperatorPayload({
      operatorUserId: "operator-user"
    });

    expect(parsed.operatorUserId).toBe("operator-user");
  });
});

describe("validateCaseMovementPayload", () => {
  it("deve validar movimentação pública com atualização de status", () => {
    const parsed = validateCaseMovementPayload({
      stage: "conciliacao",
      description: "Contato inicial realizado e proposta enviada para a parte reclamada.",
      visibility: "public",
      status: "em_analise"
    });

    expect(parsed).toEqual({
      stage: "conciliacao",
      description: "Contato inicial realizado e proposta enviada para a parte reclamada.",
      visibility: "public",
      status: "em_analise"
    });
  });
});

describe("validateCaseReviewPayload", () => {
  it("deve validar parecer aceito com solicitacao de dados", () => {
    const parsed = validateCaseReviewPayload({
      decision: "accepted",
      reason: "Ha viabilidade juridica para seguir com o caso nesta etapa.",
      requestClientData: true,
      clientDataRequest: "Enviar nota fiscal e comprovante de tentativa de solucao administrativa."
    });

    expect(parsed).toEqual({
      decision: "accepted",
      reason: "Ha viabilidade juridica para seguir com o caso nesta etapa.",
      requestClientData: true,
      clientDataRequest: "Enviar nota fiscal e comprovante de tentativa de solucao administrativa."
    });
  });
});

describe("validateCaseMessagePayload", () => {
  it("deve validar mensagem simples do caso", () => {
    const parsed = validateCaseMessagePayload({
      message: "Segue comprovante atualizado conforme solicitado."
    });

    expect(parsed.message).toBe("Segue comprovante atualizado conforme solicitado.");
  });
});

describe("validateCaseServiceFeePayload", () => {
  it("deve validar valor e vencimento da taxa inicial", () => {
    const parsed = validateCaseServiceFeePayload({
      amount: 180.5,
      dueDate: "2026-03-25"
    });

    expect(parsed).toEqual({
      amount: 180.5,
      dueDate: "2026-03-25"
    });
  });
});

describe("validateAccountProfilePatchPayload", () => {
  it("deve normalizar campos opcionais do perfil", () => {
    const parsed = validateAccountProfilePatchPayload({
      cpf: "935.411.347-80",
      rg: "12.345.678-9",
      rgIssuer: "SSP/SP",
      birthDate: "1990-05-17",
      maritalStatus: "Casado(a)",
      profession: "Analista de sistemas",
      address: {
        cep: "01001-000",
        street: "Praça da Sé",
        number: "100",
        complement: "Sala 12",
        neighborhood: "Sé",
        city: "São Paulo",
        state: "SP"
      }
    });

    expect(parsed).toEqual({
      cpf: "93541134780",
      rg: "12.345.678-9",
      rgIssuer: "SSP/SP",
      birthDate: "1990-05-17",
      maritalStatus: "Casado(a)",
      profession: "Analista de sistemas",
      address: {
        cep: "01001000",
        street: "Praça da Sé",
        number: "100",
        complement: "Sala 12",
        neighborhood: "Sé",
        city: "São Paulo",
        state: "SP"
      }
    });
  });

  it("deve rejeitar CPF invalido no patch de perfil", () => {
    expect(() =>
      validateAccountProfilePatchPayload({
        cpf: "111.111.111-11"
      })
    ).toThrowError(/CPF inválido/);
  });
});
