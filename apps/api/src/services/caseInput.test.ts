import { describe, expect, it } from "vitest";
import { validateCreateCaseInput, validateRegisterAvailabilityPayload } from "./caseInput.js";
import { CASE_STATUS_LABELS, isCaseStatus } from "../types/case.js";

describe("validateCreateCaseInput", () => {
  it("deve validar payload válido e normalizar CPF", () => {
    const parsed = validateCreateCaseInput({
      varaId: "jec-sp-capital",
      cpf: "935.411.347-80",
      resumo: "Compra não entregue no prazo e sem retorno do fornecedor."
    });

    expect(parsed.cpf).toBe("93541134780");
    expect(parsed.varaNome).toBe("JEC SP Capital");
  });

  it("deve lançar erro para vara inválida", () => {
    expect(() =>
      validateCreateCaseInput({
        varaId: "vara-invalida",
        cpf: "93541134780",
        resumo: "Resumo com tamanho suficiente para passar no schema."
      })
    ).toThrowError("Vara inválida.");
  });
});

describe("Case status mapping", () => {
  it("deve reconhecer status válidos e labels", () => {
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
