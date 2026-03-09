import { describe, expect, it } from "vitest";
import { isValidCpf, normalizeCpf } from "./cpf.js";

describe("CPF utils", () => {
  it("deve normalizar CPF removendo caracteres não numéricos", () => {
    expect(normalizeCpf("935.411.347-80")).toBe("93541134780");
  });

  it("deve validar um CPF correto", () => {
    expect(isValidCpf("935.411.347-80")).toBe(true);
  });

  it("deve invalidar um CPF com dígito incorreto", () => {
    expect(isValidCpf("935.411.347-81")).toBe(false);
  });

  it("deve invalidar sequências repetidas", () => {
    expect(isValidCpf("111.111.111-11")).toBe(false);
  });
});

