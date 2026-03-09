import type { CpfConsultaResult } from "../types/case.js";
import { normalizeCpf } from "../utils/cpf.js";
import { env } from "../config/env.js";

export interface CpfProvider {
  lookup(cpf: string): Promise<CpfConsultaResult>;
}

export class MockCpfProvider implements CpfProvider {
  async lookup(cpfInput: string): Promise<CpfConsultaResult> {
    const cpf = normalizeCpf(cpfInput);
    const suffix = cpf.slice(-4);

    return {
      cpf,
      nome: `${env.MOCK_CPF_DEFAULT_NAME} ${suffix}`,
      situacao: "regular",
      source: "mock",
      updatedAt: new Date().toISOString()
    };
  }
}

