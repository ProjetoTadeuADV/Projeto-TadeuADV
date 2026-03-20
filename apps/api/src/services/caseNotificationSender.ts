import { env } from "../config/env.js";

interface CaseNotificationEmailInput {
  toEmail: string;
  toName: string | null;
  caseId: string;
  varaNome: string;
  stageLabel: string;
  description: string;
  statusLabel: string;
  messagesUrl?: string | null;
}

interface ParsedSender {
  email: string;
  name?: string;
}

type CaseNotificationStageKey =
  | "triagem"
  | "cobranca"
  | "conciliacao"
  | "peticao"
  | "protocolo"
  | "andamento"
  | "mensagens"
  | "encerramento"
  | "geral";

function parseSender(raw: string): ParsedSender {
  const normalized = raw.trim();
  const withNameMatch = normalized.match(/^(.+?)\s*<([^>]+)>$/);
  if (withNameMatch) {
    const name = withNameMatch[1].trim().replace(/^"|"$/g, "");
    const email = withNameMatch[2].trim();
    if (!email) {
      throw new Error("EMAIL_FROM precisa conter um endereço de e-mail válido.");
    }

    return name ? { email, name } : { email };
  }

  if (!normalized.includes("@")) {
    throw new Error("EMAIL_FROM precisa conter um endereço de e-mail válido.");
  }

  return { email: normalized };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function resolveBrandName(): string {
  return (env.EMAIL_BRAND_NAME || "DoutorEu").trim();
}

function resolveSupportEmail(): string {
  const candidates = [env.EMAIL_REPLY_TO, env.EMAIL_FROM];
  for (const candidate of candidates) {
    if (!candidate?.trim()) {
      continue;
    }

    try {
      return parseSender(candidate).email;
    } catch {
      continue;
    }
  }

  return "suporte@doutoreu.com.br";
}

function normalizeStageKey(input: CaseNotificationEmailInput): CaseNotificationStageKey {
  const stage = input.stageLabel
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  const status = input.statusLabel
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

  if (stage.includes("encerr")) {
    return "encerramento";
  }

  if (status.includes("encerr")) {
    return "encerramento";
  }

  if (stage.includes("mensag")) {
    return "mensagens";
  }

  if (stage.includes("cobranc") || stage.includes("pagament")) {
    return "cobranca";
  }

  if (stage.includes("concili")) {
    return "conciliacao";
  }

  if (stage.includes("peti")) {
    return "peticao";
  }

  if (stage.includes("protocolo")) {
    return "protocolo";
  }

  if (stage.includes("analise") || stage.includes("triagem")) {
    return "triagem";
  }

  if (stage.includes("andamento")) {
    return "andamento";
  }

  return "geral";
}

function seededIndex(seed: string, length: number): number {
  if (length <= 1) {
    return 0;
  }

  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return hash % length;
}

function pickMessageVariant(variants: string[], seed: string): string {
  if (variants.length === 0) {
    return "";
  }

  return variants[seededIndex(seed, variants.length)] ?? variants[0];
}

function buildStageIntro(input: CaseNotificationEmailInput): string {
  const recipient = input.toName?.trim() || "cliente";
  const stageKey = normalizeStageKey(input);
  const seed = `${input.caseId}:${input.stageLabel}:${input.description}:${input.statusLabel}`;

  const variantsByStage: Record<CaseNotificationStageKey, string[]> = {
    triagem: [
      `Olá, ${recipient}. Como está? Recebemos o seu caso e ele está em análise inicial pela equipe responsável.`,
      `Olá, ${recipient}. Esperamos que esteja bem. Seu caso entrou na etapa de triagem e já está sendo avaliado.`,
      `Olá, ${recipient}. Registramos o andamento do seu caso na análise preliminar para definição dos próximos passos.`
    ],
    cobranca: [
      `Olá, ${recipient}. Como está? Avançamos no seu caso e a etapa atual envolve a cobrança inicial para continuidade.`,
      `Olá, ${recipient}. Seu caso teve nova atualização financeira e a equipe registrou os detalhes da cobrança.`,
      `Olá, ${recipient}. Informamos que seu caso passou para a fase de pagamento, com dados de cobrança atualizados.`
    ],
    conciliacao: [
      `Olá, ${recipient}. Como está? O seu caso recebeu uma nova movimentação na etapa de conciliação.`,
      `Olá, ${recipient}. Houve avanços na tentativa de conciliação e os registros já estão atualizados no sistema.`,
      `Olá, ${recipient}. A equipe registrou uma nova ação de conciliação para o seu caso.`
    ],
    peticao: [
      `Olá, ${recipient}. Como está? Seu caso foi atualizado na etapa de preparação da petição.`,
      `Olá, ${recipient}. Registramos nova movimentação jurídica relacionada à petição do seu caso.`,
      `Olá, ${recipient}. Sua demanda teve avanços na fase de petição e os detalhes já foram consolidados.`
    ],
    protocolo: [
      `Olá, ${recipient}. Como está? Seu caso recebeu atualização na etapa de protocolo.`,
      `Olá, ${recipient}. Registramos uma nova movimentação referente ao protocolo do seu caso.`,
      `Olá, ${recipient}. A fase de protocolo do seu caso teve um novo registro da equipe.`
    ],
    andamento: [
      `Olá, ${recipient}. Como está? Houve nova movimentação no andamento geral do seu caso.`,
      `Olá, ${recipient}. Seu caso foi atualizado com informações de progresso e próxima ação operacional.`,
      `Olá, ${recipient}. A equipe registrou uma atualização no andamento do seu caso.`
    ],
    mensagens: [
      `Olá, ${recipient}. Como está? Você recebeu uma nova comunicação no chat do seu caso.`,
      `Olá, ${recipient}. Houve uma nova mensagem no seu caso e ela já está disponível para consulta.`,
      `Olá, ${recipient}. Registramos nova interação na conversa do seu caso, com detalhes atualizados.`
    ],
    encerramento: [
      `Olá, ${recipient}. Como está? Seu caso recebeu atualização de encerramento.`,
      `Olá, ${recipient}. Informamos que houve movimentação final e o encerramento do caso foi registrado.`,
      `Olá, ${recipient}. A equipe concluiu uma etapa final do seu caso e registrou o encerramento correspondente.`
    ],
    geral: [
      `Olá, ${recipient}. Como está? Seu caso recebeu uma nova atualização e já está em acompanhamento pela equipe.`,
      `Olá, ${recipient}. Registramos uma nova movimentação no seu caso e os detalhes seguem abaixo.`,
      `Olá, ${recipient}. Houve progresso no seu caso e atualizamos as informações para sua consulta.`
    ]
  };

  return pickMessageVariant(variantsByStage[stageKey], seed);
}

export function isCaseNotificationEmailEnabled(): boolean {
  if (env.NODE_ENV === "test" || process.env.VITEST) {
    return false;
  }

  return Boolean(env.SENDGRID_API_KEY.trim() && env.EMAIL_FROM.trim());
}

function buildCaseNotificationText(input: CaseNotificationEmailInput): string {
  const introMessage = buildStageIntro(input);
  const messagesUrl = input.messagesUrl?.trim() || "";
  const supportEmail = resolveSupportEmail();

  return [
    introMessage,
    "",
    "Resumo da operação:",
    `- Caso: ${input.caseId}`,
    `- Vara: ${input.varaNome}`,
    `- Etapa: ${input.stageLabel}`,
    `- Status: ${input.statusLabel}`,
    "",
    `Resumo: ${input.description}`,
    "",
    messagesUrl
      ? `Acesse o chat do caso para acompanhar e responder: ${messagesUrl}`
      : "Acesse a plataforma para acompanhar os detalhes.",
    "",
    `Suporte: ${supportEmail}`
  ].join("\n");
}

function buildCaseNotificationHtml(input: CaseNotificationEmailInput): string {
  const brandName = resolveBrandName();
  const introMessage = escapeHtml(buildStageIntro(input));
  const messagesUrl = input.messagesUrl?.trim() || "";
  const supportEmail = escapeHtml(resolveSupportEmail());
  const messagesCta = messagesUrl
    ? `<p style="margin:18px 0 0;">
                  <a href="${escapeHtml(messagesUrl)}" style="display:inline-block;padding:11px 18px;border-radius:10px;background:#0a4d90;color:#ffffff;text-decoration:none;font-weight:700;">
                    Abrir mensagens do caso
                  </a>
                </p>`
    : "";
  const safeMessagesLink = messagesUrl ? escapeHtml(messagesUrl) : "";

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Atualização do caso</title>
  </head>
  <body style="margin:0;padding:0;background:#eef2f7;font-family:Arial,sans-serif;color:#1f2b36;">
    <span style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">
      Nova movimentação no caso ${escapeHtml(input.caseId)}.
    </span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eef2f7;padding:24px 10px;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border-radius:14px;border:1px solid #d5dfec;overflow:hidden;">
            <tr>
              <td style="padding:20px 24px;background:linear-gradient(96deg,#02294f 0%,#003b77 56%,#0b4d90 100%);color:#ffffff;">
                <strong style="font-family:Montserrat,Arial,sans-serif;font-size:22px;">${escapeHtml(brandName)}</strong>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;color:#003366;font-family:Montserrat,Arial,sans-serif;">
                  Atualização do seu caso
                </h1>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#2f4358;">
                  ${introMessage}
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f7faff;border:1px solid #d7e2f0;border-radius:12px;">
                  <tr>
                    <td style="padding:12px 14px;font-size:14px;line-height:1.6;color:#2f4358;">
                      <p style="margin:0 0 4px;"><strong>Vara:</strong> ${escapeHtml(input.varaNome)}</p>
                      <p style="margin:0 0 4px;"><strong>Etapa:</strong> ${escapeHtml(input.stageLabel)}</p>
                      <p style="margin:0;"><strong>Status:</strong> ${escapeHtml(input.statusLabel)}</p>
                    </td>
                  </tr>
                </table>
                <p style="margin:14px 0 0;font-size:14px;line-height:1.6;color:#2f4358;">
                  <strong>Resumo da operação:</strong> ${escapeHtml(input.description)}
                </p>
                ${messagesCta}
                ${
                  safeMessagesLink
                    ? `<p style="margin:10px 0 0;font-size:12px;line-height:1.5;color:#607589;word-break:break-all;">
                  Link direto: ${safeMessagesLink}
                </p>`
                    : ""
                }
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#677b8f;">
                  Este e-mail foi enviado automaticamente por ${escapeHtml(brandName)}.
                </p>
                <p style="margin:6px 0 0;font-size:12px;line-height:1.6;color:#677b8f;">
                  Suporte: <a href="mailto:${supportEmail}" style="color:#0b4d90;text-decoration:none;">${supportEmail}</a>
                </p>
                <p style="margin:10px 0 0;font-size:11px;line-height:1.6;color:#7a8b9b;">
                  Você recebeu esta mensagem porque possui um caso ativo na plataforma.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function sendCaseNotificationEmail(input: CaseNotificationEmailInput): Promise<void> {
  const apiKey = env.SENDGRID_API_KEY.trim();
  const fromRaw = env.EMAIL_FROM.trim();
  const replyToRaw = env.EMAIL_REPLY_TO.trim();

  if (!apiKey || !fromRaw) {
    throw new Error("Case notification sender is not configured.");
  }

  const from = parseSender(fromRaw);
  const replyTo = replyToRaw ? parseSender(replyToRaw) : undefined;
  const brandName = resolveBrandName();

  const payload = {
    personalizations: [
      {
        to: [{ email: input.toEmail }],
        custom_args: {
          message_type: "case_notification",
          case_id: input.caseId
        }
      }
    ],
    from,
    ...(replyTo ? { reply_to: replyTo } : {}),
    subject: `[${brandName}] Atualização do caso ${input.caseId}`,
    content: [
      {
        type: "text/plain",
        value: buildCaseNotificationText(input)
      },
      {
        type: "text/html",
        value: buildCaseNotificationHtml(input)
      }
    ],
    categories: ["transactional", "case-update"],
    tracking_settings: {
      click_tracking: {
        enable: false,
        enable_text: false
      },
      open_tracking: {
        enable: false
      }
    }
  };

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`SendGrid rejected case notification (${response.status}). ${details}`);
  }
}
