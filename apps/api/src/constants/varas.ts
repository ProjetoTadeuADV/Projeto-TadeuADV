export interface VaraOption {
  id: string;
  nome: string;
}

export const VARAS: VaraOption[] = [
  { id: "jec-sp-capital", nome: "JEC SP Capital" },
  { id: "jec-campinas", nome: "JEC Campinas" },
  { id: "jec-guarulhos", nome: "JEC Guarulhos" },
  { id: "jec-santos", nome: "JEC Santos" },
  { id: "jec-sao-bernardo", nome: "JEC São Bernardo do Campo" }
];

export function getVaraById(id: string): VaraOption | undefined {
  return VARAS.find((vara) => vara.id === id);
}

