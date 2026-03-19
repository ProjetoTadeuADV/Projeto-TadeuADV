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

function buildCaseNotificationText(input: CaseNotificationEmailInput): string {
  const recipient = input.toName?.trim() || "cliente";
  const messagesUrl = input.messagesUrl?.trim() || "";
  const supportEmail = resolveSupportEmail();

  return [
    `Ola, ${recipient}.`,
    "",
    "Registramos uma nova movimentacao no seu caso:",
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
  const recipient = escapeHtml(input.toName?.trim() || "cliente");
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
    <title>Atualizacao do caso</title>
  </head>
  <body style="margin:0;padding:0;background:#eef2f7;font-family:Arial,sans-serif;color:#1f2b36;">
    <span style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">
      Nova movimentacao no caso ${escapeHtml(input.caseId)}.
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
                  Atualizacao do seu caso
                </h1>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#2f4358;">Ola, ${recipient}.</p>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#2f4358;">
                  O caso <strong>${escapeHtml(input.caseId)}</strong> recebeu uma nova movimentacao.
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
                  <strong>Resumo:</strong> ${escapeHtml(input.description)}
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
    subject: `[${brandName}] Atualizacao do caso ${input.caseId}`,
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
