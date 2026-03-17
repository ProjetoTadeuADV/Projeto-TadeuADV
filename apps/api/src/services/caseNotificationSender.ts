import { env } from "../config/env.js";

interface CaseNotificationEmailInput {
  toEmail: string;
  toName: string | null;
  caseId: string;
  varaNome: string;
  stageLabel: string;
  description: string;
  statusLabel: string;
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

export function isCaseNotificationEmailEnabled(): boolean {
  if (env.NODE_ENV === "test" || process.env.VITEST) {
    return false;
  }

  return Boolean(env.SENDGRID_API_KEY.trim() && env.EMAIL_FROM.trim());
}

function buildCaseNotificationText(input: CaseNotificationEmailInput): string {
  const recipient = input.toName?.trim() || "cliente";
  return [
    `Olá, ${recipient}.`,
    "",
    "Houve uma nova movimentação no seu caso:",
    `- Caso: ${input.caseId}`,
    `- Vara: ${input.varaNome}`,
    `- Etapa: ${input.stageLabel}`,
    `- Status: ${input.statusLabel}`,
    "",
    `Resumo da movimentação: ${input.description}`,
    "",
    "Acesse a plataforma para acompanhar os detalhes."
  ].join("\n");
}

function buildCaseNotificationHtml(input: CaseNotificationEmailInput): string {
  const brandName = resolveBrandName();
  const recipient = escapeHtml(input.toName?.trim() || "cliente");

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Movimentação do caso</title>
  </head>
  <body style="margin:0;padding:0;background:#edf1f5;font-family:Inter,Arial,sans-serif;color:#1f2b36;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#edf1f5;padding:24px 10px;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border-radius:16px;border:1px solid #d7e3f2;overflow:hidden;">
            <tr>
              <td style="padding:20px 24px;background:linear-gradient(96deg,#02294f 0%,#003b77 56%,#0b4d90 100%);color:#fff;">
                <strong style="font-family:Montserrat,Arial,sans-serif;font-size:20px;">${escapeHtml(brandName)}</strong>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 24px;">
                <h1 style="margin:0 0 12px;font-size:24px;color:#003366;">Nova movimentação no seu caso</h1>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.5;">Olá, ${recipient}.</p>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.5;">
                  Registramos uma atualização no seu caso <strong>${escapeHtml(input.caseId)}</strong>.
                </p>
                <ul style="margin:0 0 14px 18px;padding:0;font-size:14px;line-height:1.6;color:#33495d;">
                  <li><strong>Vara:</strong> ${escapeHtml(input.varaNome)}</li>
                  <li><strong>Etapa:</strong> ${escapeHtml(input.stageLabel)}</li>
                  <li><strong>Status:</strong> ${escapeHtml(input.statusLabel)}</li>
                </ul>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#33495d;">
                  <strong>Resumo:</strong> ${escapeHtml(input.description)}
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
        to: [{ email: input.toEmail }]
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
    ]
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
