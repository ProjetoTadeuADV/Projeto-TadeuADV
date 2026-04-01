import { normalizeMunicipioKey, resolveSpMunicipioVara, SP_MUNICIPIO_VARA_MAP } from "./spMunicipioVaraMap.js";

export interface VaraOption {
  id: string;
  nome: string;
}

export const CAPITAL_VARA_ID = "jec-sp-capital";

const LEGACY_VARAS: VaraOption[] = [
  { id: CAPITAL_VARA_ID, nome: "JEC SP Capital" },
  { id: "jec-campinas", nome: "JEC Campinas" },
  { id: "jec-guarulhos", nome: "JEC Guarulhos" },
  { id: "jec-santos", nome: "JEC Santos" },
  { id: "jec-sao-bernardo", nome: "JEC São Bernardo do Campo" }
];

function buildMunicipioVaraId(municipioKey: string): string {
  if (municipioKey === "sao paulo") {
    return CAPITAL_VARA_ID;
  }

  const slug = municipioKey
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

  return `jec-sp-${slug}`;
}

const SP_VARAS_FROM_MAP: VaraOption[] = Object.entries(SP_MUNICIPIO_VARA_MAP)
  .map(([municipioKey, item]) => ({
    id: buildMunicipioVaraId(municipioKey),
    nome: `JEC ${item.municipio}/SP - ${item.varaNome}`
  }))
  .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

export const VARAS: VaraOption[] = (() => {
  const all = [...LEGACY_VARAS];
  const existingIds = new Set(all.map((item) => item.id));
  for (const item of SP_VARAS_FROM_MAP) {
    if (existingIds.has(item.id)) {
      continue;
    }

    all.push(item);
    existingIds.add(item.id);
  }

  return all;
})();

export function getVaraById(id: string): VaraOption | undefined {
  return VARAS.find((vara) => vara.id === id);
}

export function resolveVaraByMunicipioUf(
  municipio: string | null | undefined,
  uf: string | null | undefined
): VaraOption {
  const capitalVara = getVaraById(CAPITAL_VARA_ID) ?? VARAS[0];
  const normalizedUf = (uf ?? "").trim().toUpperCase();
  if (normalizedUf !== "SP") {
    return capitalVara;
  }

  const municipioKey = normalizeMunicipioKey(municipio ?? "");
  if (!municipioKey) {
    return capitalVara;
  }

  const municipioVara = resolveSpMunicipioVara(municipioKey);
  if (!municipioVara) {
    return capitalVara;
  }

  const varaId = buildMunicipioVaraId(municipioKey);
  return getVaraById(varaId) ?? capitalVara;
}

