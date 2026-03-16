import { describe, expect, it } from "vitest";
import { validateCreateCaseInput, validateRegisterAvailabilityPayload } from "./caseInput.js";
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
        evidence: "Faturas, comprovantes de pagamento e protocolos de atendimento.",
        claimValue: 2500.5,
        hearingInterest: true
      }
    });

    expect(parsed.petitionInitial).toMatchObject({
      defendantType: "pessoa_juridica",
      defendantDocument: "12345678000190",
      claimSubject: "Cobranca indevida",
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
