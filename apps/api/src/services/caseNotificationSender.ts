import { env } from "../config/env.js";

export type CaseNotificationType = "update" | "billing" | "messages" | "closure";

interface CaseNotificationEmailInput {
  toEmail: string;
  toName: string | null;
  caseId: string;
  varaNome: string;
  stageLabel: string;
  description: string;
  statusLabel: string;
  messagesUrl?: string | null;
  notificationType?: CaseNotificationType;
}

interface ParsedSender {
  email: string;
  name?: string;
}

interface NotificationTemplate {
  type: CaseNotificationType;
  category: string;
  subjectPrefix: string;
  preheader: string;
  title: string;
  intro: string;
  ctaLabel: string;
  badgeLabel: string;
  accentFrom: string;
  accentTo: string;
}

const NOTIFICATION_TEMPLATES: Record<CaseNotificationType, NotificationTemplate> = {
  update: {
    type: "update",
    category: "case-update",
    subjectPrefix: "Atualizacao do caso",
    preheader: "Nova atualizacao registrada no seu caso.",
    title: "Atualizacao do seu caso",
    intro: "Registramos uma nova movimentacao na linha do tempo do processo.",
    ctaLabel: "Acompanhar caso",
    badgeLabel: "Atualizacao",
    accentFrom: "#02294f",
    accentTo: "#0b4d90"
  },
  billing: {
    type: "billing",
    category: "case-billing",
    subjectPrefix: "Atualizacao de cobranca",
    preheader: "Nova atualizacao de pagamento/cobranca no seu caso.",
    title: "Atualizacao financeira do caso",
    intro: "Houve uma alteracao na etapa de cobranca ou pagamento.",
    ctaLabel: "Ver detalhes da cobranca",
    badgeLabel: "Cobranca",
    accentFrom: "#063c2f",
    accentTo: "#0d7a5f"
  },
  messages: {
    type: "messages",
    category: "case-messages",
    subjectPrefix: "Nova mensagem no caso",
    preheader: "Voce recebeu nova mensagem no chat do caso.",
    title: "Nova mensagem do caso",
    intro: "Existe uma nova comunicacao no chat do processo.",
    ctaLabel: "Abrir mensagens",
    badgeLabel: "Mensagem",
    accentFrom: "#1f2a6b",
    accentTo: "#3a58cc"
  },
  closure: {
    type: "closure",
    category: "case-closure",
    subjectPrefix: "Atualizacao de encerramento",
    preheader: "Status de encerramento atualizado no seu caso.",
    title: "Encerramento e decisao do caso",
    intro: "A etapa de encerramento recebeu uma nova atualizacao.",
    ctaLabel: "Consultar decisao",
    badgeLabel: "Encerramento",
    accentFrom: "#5a1c1c",
    accentTo: "#b04343"
  }
};

function parseSender(raw: string): ParsedSender {
  const normalized = raw.trim();
  const withNameMatch = normalized.match(/^(.+?)\s*<([^>]+)>$/);
  if (withNameMatch) {
    const name = withNameMatch[1].trim().replace(/^"|"$/g, "");
    const email = withNameMatch[2].trim();
    if (!email) {
      throw new Error("EMAIL_FROM precisa conter um endereco de e-mail valido.");
    }

    return name ? { email, name } : { email };
  }

  if (!normalized.includes("@")) {
    throw new Error("EMAIL_FROM precisa conter um endereco de e-mail valido.");
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

function buildLogoMarkup(brandName: string): string {
  if (!env.EMAIL_LOGO_URL.trim()) {
    return `<div style="font-family:Montserrat,Arial,sans-serif;font-size:30px;font-weight:800;letter-spacing:0.2px;line-height:1;">
      <span style="color:#ffffff;">Doutor</span><span style="color:#d4af37;">Eu</span>
    </div>`;
  }

  return `<img src="${escapeHtml(env.EMAIL_LOGO_URL)}" alt="${escapeHtml(brandName)}" style="display:block;max-width:220px;height:auto;border:0;outline:none;text-decoration:none;" />`;
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

export function isCaseNotificationEmailEnabled(): boolean {
  if (env.NODE_ENV === "test" || process.env.VITEST) {
    return false;
  }

  return Boolean(env.SENDGRID_API_KEY.trim() && env.EMAIL_FROM.trim());
}

function inferNotificationType(input: CaseNotificationEmailInput): CaseNotificationType {
  if (input.notificationType) {
    return input.notificationType;
  }

  const stage = input.stageLabel.trim().toLowerCase();
  const description = input.description.trim().toLowerCase();
  const status = input.statusLabel.trim().toLowerCase();
  const combined = `${stage} ${description} ${status}`;

  if (
    combined.includes("cobranc") ||
    combined.includes("pagament") ||
    combined.includes("taxa") ||
    combined.includes("boleto")
  ) {
    return "billing";
  }

  if (combined.includes("mensag") || combined.includes("chat")) {
    return "messages";
  }

  if (
    combined.includes("encerr") ||
    combined.includes("rejeit") ||
    combined.includes("acordo") ||
    status.includes("encerr")
  ) {
    return "closure";
  }

  return "update";
}

function resolveTemplate(input: CaseNotificationEmailInput): NotificationTemplate {
  const type = inferNotificationType(input);
  return NOTIFICATION_TEMPLATES[type];
}

function buildCaseNotificationText(input: CaseNotificationEmailInput, template: NotificationTemplate): string {
  const recipient = input.toName?.trim() || "cliente";
  const messagesUrl = input.messagesUrl?.trim() || "";
  const supportEmail = resolveSupportEmail();

  return [
    `Ola, ${recipient}.`,
    "",
    `${template.title}.`,
    template.intro,
    "",
    "Resumo da notificacao:",
    `- Caso: ${input.caseId}`,
    `- Vara: ${input.varaNome}`,
    `- Etapa: ${input.stageLabel}`,
    `- Status: ${input.statusLabel}`,
    `- Tipo: ${template.badgeLabel}`,
    "",
    `Resumo: ${input.description}`,
    "",
    messagesUrl
      ? `${template.ctaLabel}: ${messagesUrl}`
      : "Acesse a plataforma para acompanhar os detalhes.",
    "",
    `Suporte: ${supportEmail}`
  ].join("\n");
}

function buildCaseNotificationHtml(input: CaseNotificationEmailInput, template: NotificationTemplate): string {
  const brandName = resolveBrandName();
  const recipient = escapeHtml(input.toName?.trim() || "cliente");
  const messagesUrl = input.messagesUrl?.trim() || "";
  const supportEmail = escapeHtml(resolveSupportEmail());
  const stageLabel = escapeHtml(input.stageLabel);
  const statusLabel = escapeHtml(input.statusLabel);
  const summary = escapeHtml(input.description);
  const safeCaseId = escapeHtml(input.caseId);
  const safeVara = escapeHtml(input.varaNome);
  const badgeLabel = escapeHtml(template.badgeLabel);
  const messagesCta = messagesUrl
    ? `<p style="margin:18px 0 0;">
                  <a href="${escapeHtml(messagesUrl)}" style="display:inline-block;padding:11px 18px;border-radius:10px;background:#0a4d90;color:#ffffff;text-decoration:none;font-weight:700;">
                    ${escapeHtml(template.ctaLabel)}
                  </a>
                </p>`
    : "";
  const safeMessagesLink = messagesUrl ? escapeHtml(messagesUrl) : "";

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(template.subjectPrefix)}</title>
  </head>
  <body style="margin:0;padding:0;background:#eef2f7;font-family:Arial,sans-serif;color:#1f2b36;">
    <span style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">
      ${escapeHtml(template.preheader)}
    </span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eef2f7;padding:24px 10px;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border-radius:14px;border:1px solid #d5dfec;overflow:hidden;">
            <tr>
              <td style="padding:20px 24px;background:linear-gradient(96deg,${template.accentFrom} 0%,${template.accentTo} 100%);color:#ffffff;">
                ${buildLogoMarkup(brandName)}
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <div style="display:inline-block;margin:0 0 10px;padding:4px 10px;border-radius:999px;background:#edf3fb;border:1px solid #d1deee;font-size:12px;font-weight:700;color:#244b71;">
                  ${badgeLabel}
                </div>
                <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;color:#003366;font-family:Montserrat,Arial,sans-serif;">
                  ${escapeHtml(template.title)}
                </h1>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#2f4358;">Ola, ${recipient}.</p>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#2f4358;">
                  ${escapeHtml(template.intro)}
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f7faff;border:1px solid #d7e2f0;border-radius:12px;">
                  <tr>
                    <td style="padding:12px 14px;font-size:14px;line-height:1.6;color:#2f4358;">
                      <p style="margin:0 0 4px;"><strong>Caso:</strong> ${safeCaseId}</p>
                      <p style="margin:0 0 4px;"><strong>Vara:</strong> ${safeVara}</p>
                      <p style="margin:0 0 4px;"><strong>Etapa:</strong> ${stageLabel}</p>
                      <p style="margin:0;"><strong>Status:</strong> ${statusLabel}</p>
                    </td>
                  </tr>
                </table>
                <p style="margin:14px 0 0;font-size:14px;line-height:1.6;color:#2f4358;">
                  <strong>Resumo:</strong> ${summary}
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
                  Voce recebeu esta mensagem porque possui um caso ativo na plataforma.
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
  const template = resolveTemplate(input);

  const payload = {
    personalizations: [
      {
        to: [{ email: input.toEmail }],
        custom_args: {
          message_type: "case_notification",
          case_id: input.caseId,
          notification_type: template.type
        }
      }
    ],
    from,
    ...(replyTo ? { reply_to: replyTo } : {}),
    subject: `[${brandName}] ${template.subjectPrefix} - caso ${input.caseId}`,
    content: [
      {
        type: "text/plain",
        value: buildCaseNotificationText(input, template)
      },
      {
        type: "text/html",
        value: buildCaseNotificationHtml(input, template)
      }
    ],
    categories: ["transactional", "case-update", template.category],
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
