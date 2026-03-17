import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import type {
  CaseRecord,
  PetitionAttachment,
  PetitionPretension,
  PetitionTimelineEvent,
  UserRecord
} from "../types/case.js";
import { isValidCpf, normalizeCpf } from "../utils/cpf.js";
import { HttpError } from "../utils/httpError.js";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const TOP_MARGIN = 78;
const BOTTOM_MARGIN = 64;
const SIDE_MARGIN = 62;
const CONTENT_WIDTH = A4_WIDTH - SIDE_MARGIN * 2;

interface PetitionPdfContext {
  caseItem: CaseRecord;
  owner: UserRecord | null;
}

interface PetitionData {
  caseId: string;
  caseCode: string;
  varaNome: string;
  authorName: string;
  authorCpf: string;
  authorEmail: string | null;
  claimantAddress: string | null;
  claimSubject: string;
  defendantName: string | null;
  defendantDocument: string | null;
  defendantAddress: string | null;
  summary: string;
  facts: string;
  timelineEvents: PetitionTimelineEvent[];
  legalGrounds: string;
  requests: string[];
  pretensions: PetitionPretension[];
  evidence: string | null;
  attachments: PetitionAttachment[];
  claimValue: number | null;
  hearingInterest: boolean;
  clientName: string | null;
}

interface ParagraphOptions {
  font: PDFFont;
  fontSize: number;
  lineHeight: number;
  firstLineIndent?: number;
}

class FormalPdfWriter {
  private page: PDFPage;
  private y: number;

  constructor(
    private readonly document: PDFDocument,
    private readonly regularFont: PDFFont,
    private readonly boldFont: PDFFont,
    private readonly pageHeaderTitle: string
  ) {
    this.page = this.createPage();
    this.y = A4_HEIGHT - TOP_MARGIN - 18;
  }

  addSpace(points: number): void {
    this.y -= points;
  }

  writeCentered(text: string, font: PDFFont, fontSize: number, lineHeight: number): void {
    const normalized = text
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    for (const paragraph of normalized) {
      const lines = splitTextByWidth(paragraph, font, fontSize, CONTENT_WIDTH);

      for (const line of lines) {
        this.ensureSpace(lineHeight);
        const textWidth = font.widthOfTextAtSize(line, fontSize);
        const x = (A4_WIDTH - textWidth) / 2;
        this.page.drawText(line, {
          x,
          y: this.y,
          font,
          size: fontSize
        });
        this.y -= lineHeight;
      }
    }
  }

  writeParagraph(text: string, options: ParagraphOptions): void {
    const firstLineIndent = options.firstLineIndent ?? 0;
    const paragraphs = text
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    for (const [paragraphIndex, paragraph] of paragraphs.entries()) {
      const lines = splitTextByWidth(
        paragraph,
        options.font,
        options.fontSize,
        CONTENT_WIDTH - firstLineIndent
      );

      for (const [lineIndex, line] of lines.entries()) {
        this.ensureSpace(options.lineHeight);
        this.page.drawText(line, {
          x: SIDE_MARGIN + (lineIndex === 0 ? firstLineIndent : 0),
          y: this.y,
          font: options.font,
          size: options.fontSize
        });
        this.y -= options.lineHeight;
      }

      if (paragraphIndex < paragraphs.length - 1) {
        this.y -= 6;
      }
    }
  }

  writeSectionTitle(title: string): void {
    this.addSpace(8);
    this.ensureSpace(18);
    this.page.drawText(title, {
      x: SIDE_MARGIN,
      y: this.y,
      font: this.boldFont,
      size: 11.5
    });
    this.y -= 18;
  }

  writeNumberedList(items: string[], fontSize = 11, lineHeight = 17): void {
    for (const [index, item] of items.entries()) {
      const prefix = `${index + 1}. `;
      const lines = splitTextByWidth(
        `${prefix}${item}`,
        this.regularFont,
        fontSize,
        CONTENT_WIDTH - 18
      );

      for (const [lineIndex, line] of lines.entries()) {
        this.ensureSpace(lineHeight);
        this.page.drawText(line, {
          x: SIDE_MARGIN + (lineIndex === 0 ? 8 : 26),
          y: this.y,
          font: this.regularFont,
          size: fontSize
        });
        this.y -= lineHeight;
      }

      this.y -= 2;
    }
  }

  private ensureSpace(requiredHeight: number): void {
    if (this.y - requiredHeight >= BOTTOM_MARGIN) {
      return;
    }

    this.page = this.createPage();
    this.y = A4_HEIGHT - TOP_MARGIN - 18;
  }

  private createPage(): PDFPage {
    const page = this.document.addPage([A4_WIDTH, A4_HEIGHT]);
    const title = "JUIZADO ESPECIAL CIVEL";
    const titleSize = 10;
    const subtitleSize = 9.5;
    const titleWidth = this.boldFont.widthOfTextAtSize(title, titleSize);
    const subtitleWidth = this.regularFont.widthOfTextAtSize(this.pageHeaderTitle, subtitleSize);

    page.drawText(title, {
      x: (A4_WIDTH - titleWidth) / 2,
      y: A4_HEIGHT - 42,
      font: this.boldFont,
      size: titleSize
    });

    page.drawText(this.pageHeaderTitle, {
      x: (A4_WIDTH - subtitleWidth) / 2,
      y: A4_HEIGHT - 56,
      font: this.regularFont,
      size: subtitleSize
    });

    page.drawLine({
      start: { x: SIDE_MARGIN, y: A4_HEIGHT - 64 },
      end: { x: A4_WIDTH - SIDE_MARGIN, y: A4_HEIGHT - 64 },
      thickness: 0.8
    });

    return page;
  }
}

function normalizeText(value: string | null | undefined): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = normalizeText(value);
  return normalized.length > 0 ? normalized : null;
}

function splitTextByWidth(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [""];
  }

  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    const nextWidth = font.widthOfTextAtSize(nextLine, fontSize);

    if (nextWidth <= maxWidth) {
      currentLine = nextLine;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
      currentLine = word;
      continue;
    }

    let chunk = "";
    for (const character of word) {
      const candidate = `${chunk}${character}`;
      if (font.widthOfTextAtSize(candidate, fontSize) > maxWidth && chunk.length > 0) {
        lines.push(chunk);
        chunk = character;
      } else {
        chunk = candidate;
      }
    }

    currentLine = chunk;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function formatCpf(cpfInput: string): string {
  const cpf = normalizeCpf(cpfInput);
  if (cpf.length !== 11) {
    return cpf;
  }

  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9, 11)}`;
}

function formatDefendantDocument(value: string | null): string {
  if (!value) {
    return "não informado";
  }

  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) {
    return formatCpf(digits);
  }

  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
  }

  return value;
}

function formatCurrencyBr(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "a definir em liquidação";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

function formatEventDateBr(value: string): string {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(parsed);
}

function formatPretensionLabel(value: PetitionPretension["type"]): string {
  switch (value) {
    case "ressarcimento_valor":
      return "Ressarcimento de valor";
    case "indenizacao_danos":
      return "Indenização por danos morais ou materiais";
    case "cumprimento_compromisso":
      return "Cumprimento de compromisso acordado";
    case "retratacao":
      return "Retratação";
    case "devolucao_produto":
      return "Devolução do produto com ressarcimento";
    case "outro":
      return "Outro pedido";
    default:
      return "Pedido";
  }
}

function formatPretensionSummary(item: PetitionPretension): string {
  const label = formatPretensionLabel(item.type);
  const details = normalizeOptionalText(item.details);
  const amount =
    typeof item.amount === "number" && Number.isFinite(item.amount)
      ? ` (valor sugerido: ${formatCurrencyBr(item.amount)})`
      : "";

  if (details) {
    return `${label}: ${details}${amount}`;
  }

  return `${label}${amount}`;
}

function formatAttachmentSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = sizeBytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const rounded = unitIndex === 0 ? `${Math.round(value)}` : value.toFixed(1);
  return `${rounded} ${units[unitIndex]}`;
}

function resolveLocalDateLine(claimantAddress: string | null): string {
  const today = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date());

  if (!claimantAddress) {
    return `Local e data: ${today}.`;
  }

  const parts = claimantAddress
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const cityHint = parts.length > 0 ? parts[parts.length - 1] : "Local não informado";
  return `${cityHint}, ${today}.`;
}

function buildPetitionData(context: PetitionPdfContext): PetitionData {
  const caseId = normalizeText(context.caseItem.id);
  const caseCode = normalizeText(context.caseItem.caseCode);
  const varaNome = normalizeText(context.caseItem.varaNome);
  const authorCpf = normalizeCpf(context.caseItem.cpf);
  const summary = normalizeText(context.caseItem.resumo);
  const petitionInitial = context.caseItem.petitionInitial ?? null;
  const ownerName = normalizeOptionalText(context.owner?.name);
  const ownerEmail = normalizeOptionalText(context.owner?.email);
  const clientName = normalizeOptionalText(context.caseItem.cpfConsulta?.nome);
  const authorName = ownerName ?? clientName ?? ownerEmail ?? "";

  const validationErrors: string[] = [];
  if (!caseId) {
    validationErrors.push("Identificador do caso não encontrado.");
  }

  if (!caseCode) {
    validationErrors.push("Código do caso não encontrado.");
  }

  if (varaNome.length < 3) {
    validationErrors.push("Vara responsável não informada.");
  }

  if (!isValidCpf(authorCpf)) {
    validationErrors.push("CPF inválido para emissão da petição.");
  }

  if (summary.length < 10) {
    validationErrors.push("Resumo da petição muito curto.");
  }

  if (!authorName) {
    validationErrors.push("Nome do requerente não disponível.");
  }

  if (petitionInitial && petitionInitial.requests.length === 0) {
    validationErrors.push("Pedidos da petição inicial não informados.");
  }

  if (validationErrors.length > 0) {
    throw new HttpError(422, "Dados insuficientes para gerar a petição inicial.", {
      fields: validationErrors
    });
  }

  const fallbackRequests = [
    "Recebimento da presente petição inicial e regular processamento do feito.",
    "Citação da parte reclamada para apresentar defesa no prazo legal.",
    "Procedência dos pedidos com condenação da parte reclamada nas obrigações cabíveis.",
    "Produção de todas as provas admitidas em direito."
  ];

  return {
    caseId,
    caseCode,
    varaNome,
    authorName,
    authorCpf,
    authorEmail: ownerEmail,
    claimantAddress: petitionInitial?.claimantAddress ?? null,
    claimSubject: petitionInitial?.claimSubject ?? "reparação cível",
    defendantName: petitionInitial?.defendantName ?? null,
    defendantDocument: petitionInitial?.defendantDocument ?? null,
    defendantAddress: petitionInitial?.defendantAddress ?? null,
    summary,
    facts: petitionInitial?.facts ?? summary,
    timelineEvents: petitionInitial?.timelineEvents ?? [],
    legalGrounds:
      petitionInitial?.legalGrounds ??
      "Os fatos narrados indicam violação de direito material, com necessidade de tutela jurisdicional para recomposição integral do dano suportado.",
    requests: petitionInitial?.requests.length ? petitionInitial.requests : fallbackRequests,
    pretensions: petitionInitial?.pretensions ?? [],
    evidence: petitionInitial?.evidence ?? null,
    attachments: petitionInitial?.attachments ?? [],
    claimValue: petitionInitial?.claimValue ?? null,
    hearingInterest: petitionInitial?.hearingInterest ?? true,
    clientName
  };
}

function addPageNumbers(pdf: PDFDocument, font: PDFFont): void {
  const pages = pdf.getPages();
  const total = pages.length;

  for (const [index, page] of pages.entries()) {
    const text = `Pagina ${index + 1} de ${total}`;
    const size = 9;
    const width = font.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: (A4_WIDTH - width) / 2,
      y: 28,
      font,
      size
    });
  }
}

export async function generateInitialPetitionPdf(context: PetitionPdfContext): Promise<{
  fileName: string;
  bytes: Uint8Array;
}> {
  const data = buildPetitionData(context);

  const pdf = await PDFDocument.create();
  const regularFont = await pdf.embedFont(StandardFonts.TimesRoman);
  const boldFont = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const writer = new FormalPdfWriter(pdf, regularFont, boldFont, data.varaNome.toUpperCase());

  writer.writeCentered(`PETIÇÃO INICIAL - ${data.claimSubject.toUpperCase()}`, boldFont, 12.5, 20);
  writer.writeCentered("Processo n.: ________________________________", regularFont, 11, 18);

  writer.addSpace(6);
  writer.writeParagraph(
    `${data.authorName}, inscrito(a) no CPF sob o número ${formatCpf(data.authorCpf)}, residente em ${data.claimantAddress ?? "endereço não informado"}, vem, respeitosamente, perante Vossa Excelência, ajuizar a presente demanda em face de ${data.defendantName ?? "parte reclamada não informada"}, pelos fatos e fundamentos a seguir expostos.`,
    {
      font: regularFont,
      fontSize: 11,
      lineHeight: 17,
      firstLineIndent: 22
    }
  );

  writer.writeSectionTitle("I - DAS PARTES");
  writer.writeParagraph(`Requerente: ${data.authorName}.`, {
    font: regularFont,
    fontSize: 11,
    lineHeight: 17
  });
  writer.writeParagraph(`CPF: ${formatCpf(data.authorCpf)}.`, {
    font: regularFont,
    fontSize: 11,
    lineHeight: 17
  });
  writer.writeParagraph(`Endereço do requerente: ${data.claimantAddress ?? "não informado"}.`, {
    font: regularFont,
    fontSize: 11,
    lineHeight: 17
  });
  writer.writeParagraph(`Reclamada: ${data.defendantName ?? "não informada"}.`, {
    font: regularFont,
    fontSize: 11,
    lineHeight: 17
  });
  writer.writeParagraph(`Documento da reclamada: ${formatDefendantDocument(data.defendantDocument)}.`, {
    font: regularFont,
    fontSize: 11,
    lineHeight: 17
  });
  writer.writeParagraph(`Endereço da reclamada: ${data.defendantAddress ?? "não informado"}.`, {
    font: regularFont,
    fontSize: 11,
    lineHeight: 17
  });

  writer.writeSectionTitle("II - DOS FATOS");
  if (data.timelineEvents.length > 0) {
    writer.writeParagraph("Cronologia dos eventos narrados:", {
      font: regularFont,
      fontSize: 11,
      lineHeight: 17,
      firstLineIndent: 22
    });
    writer.writeNumberedList(
      data.timelineEvents.map(
        (item) => `${formatEventDateBr(item.eventDate)} - ${item.description}`
      ),
      10.8,
      16.5
    );
  }
  writer.writeParagraph(data.facts, {
    font: regularFont,
    fontSize: 11,
    lineHeight: 17,
    firstLineIndent: 22
  });

  writer.writeSectionTitle("III - DO DIREITO");
  writer.writeParagraph(data.legalGrounds, {
    font: regularFont,
    fontSize: 11,
    lineHeight: 17,
    firstLineIndent: 22
  });

  writer.writeSectionTitle("IV - DOS PEDIDOS");
  writer.writeNumberedList(data.requests, 11, 17);
  if (data.pretensions.length > 0) {
    writer.writeParagraph("Pretensões declaradas na triagem:", {
      font: regularFont,
      fontSize: 11,
      lineHeight: 17,
      firstLineIndent: 22
    });
    writer.writeNumberedList(data.pretensions.map((item) => formatPretensionSummary(item)), 10.8, 16.5);
  }

  writer.writeSectionTitle("V - DO VALOR DA CAUSA");
  writer.writeParagraph(`Dá-se à causa o valor de ${formatCurrencyBr(data.claimValue)}.`, {
    font: regularFont,
    fontSize: 11,
    lineHeight: 17,
    firstLineIndent: 22
  });

  writer.writeSectionTitle("VI - DAS PROVAS E DA AUDIÊNCIA");
  writer.writeParagraph(
    `Provas indicadas: ${data.evidence ?? "documentos, comprovantes e demais meios admitidos em direito."}`,
    {
      font: regularFont,
      fontSize: 11,
      lineHeight: 17,
      firstLineIndent: 22
    }
  );
  writer.writeParagraph(
    `Interesse em audiência de conciliação: ${data.hearingInterest ? "sim" : "não"}.`,
    {
      font: regularFont,
      fontSize: 11,
      lineHeight: 17,
      firstLineIndent: 22
    }
  );
  if (data.attachments.length > 0) {
    writer.writeParagraph("Documentos anexados no sistema:", {
      font: regularFont,
      fontSize: 11,
      lineHeight: 17,
      firstLineIndent: 22
    });
    writer.writeNumberedList(
      data.attachments.map(
        (item) => `${item.originalName} (${formatAttachmentSize(item.sizeBytes)})`
      ),
      10.5,
      16
    );
  } else {
    writer.writeParagraph("Não há anexos digitais vinculados a esta petição.", {
      font: regularFont,
      fontSize: 11,
      lineHeight: 17,
      firstLineIndent: 22
    });
  }

  writer.addSpace(10);
  writer.writeParagraph(
    `Referência interna do caso: ${data.caseCode} (id ${data.caseId}). Cliente identificado na triagem: ${data.clientName ?? "não informado"}. E-mail para contato: ${data.authorEmail ?? "não informado"}.`,
    {
      font: regularFont,
      fontSize: 10.5,
      lineHeight: 16
    }
  );

  writer.addSpace(18);
  writer.writeParagraph("Nesses termos, pede deferimento.", {
    font: regularFont,
    fontSize: 11,
    lineHeight: 17
  });
  writer.addSpace(10);
  writer.writeParagraph(resolveLocalDateLine(data.claimantAddress), {
    font: regularFont,
    fontSize: 11,
    lineHeight: 17
  });

  writer.addSpace(22);
  writer.writeCentered("________________________________________", regularFont, 11, 16);
  writer.writeCentered(data.authorName, boldFont, 11, 16);
  writer.writeCentered(`CPF ${formatCpf(data.authorCpf)}`, regularFont, 10.5, 16);

  addPageNumbers(pdf, regularFont);

  const bytes = await pdf.save();
  const normalizedCode = data.caseCode.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  const fileName = `peticao-inicial-${normalizedCode}.pdf`;
  return { fileName, bytes };
}


