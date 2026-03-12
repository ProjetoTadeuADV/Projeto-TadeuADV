import { env } from "../config/env.js";

interface VerificationEmailInput {
  email: string;
  name: string | null;
  verificationLink: string;
}

interface ParsedSender {
  email: string;
  name?: string;
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

function buildLogoMarkup(brandName: string): string {
  if (!env.EMAIL_LOGO_URL) {
    return `<div style="font-family:Montserrat,Arial,sans-serif;font-size:29px;font-weight:800;letter-spacing:0.2px;line-height:1;">
      <span style="color:#ffffff;">Doutor</span><span style="color:#d4af37;">Eu</span>
    </div>`;
  }

  return `<img src="${escapeHtml(env.EMAIL_LOGO_URL)}" alt="${escapeHtml(brandName)}" style="display:block;max-width:220px;height:auto;border:0;outline:none;text-decoration:none;" />`;
}

function buildVerificationEmailHtml(input: VerificationEmailInput): string {
  const brandName = resolveBrandName();
  const recipient = input.name ? escapeHtml(input.name) : "cliente";
  const escapedLink = escapeHtml(input.verificationLink);

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Confirme seu e-mail</title>
  </head>
  <body style="margin:0;padding:0;background:#edf1f5;font-family:Inter,Arial,sans-serif;color:#1f2b36;">
    <span style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">
      Confirme seu e-mail para liberar o acesso completo na plataforma ${escapeHtml(brandName)}.
    </span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#edf1f5;padding:24px 10px;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #d7e3f2;">
            <tr>
              <td style="padding:22px 24px;background:linear-gradient(96deg,#02294f 0%,#003b77 56%,#0b4d90 100%);">
                ${buildLogoMarkup(brandName)}
              </td>
            </tr>
            <tr>
              <td style="padding:26px 24px 10px;">
                <p style="margin:0 0 10px;font-size:15px;color:#4f5d6c;">O Doutor da Sua Causa é Você.</p>
                <h1 style="margin:0 0 14px;font-family:Montserrat,Arial,sans-serif;font-size:30px;line-height:1.15;color:#003366;">
                  Verifique seu e-mail
                </h1>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#33495d;">
                  Olá, ${recipient}. Para concluir seu cadastro, confirme o endereço de e-mail desta conta.
                </p>
                <p style="margin:0 0 22px;font-size:15px;line-height:1.55;color:#33495d;">
                  Assim que a verificação for concluída, seu acesso ao painel será liberado normalmente.
                </p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="border-radius:10px;background:#003366;">
                      <a href="${escapedLink}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 20px;border-radius:10px;font-family:Montserrat,Arial,sans-serif;font-size:14px;font-weight:700;letter-spacing:0.02em;color:#ffffff;text-decoration:none;">
                        Confirmar e-mail
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 24px 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f7fafc;border:1px solid #d8e3f1;border-radius:12px;">
                  <tr>
                    <td style="padding:12px 14px;">
                      <p style="margin:0 0 8px;font-size:12px;line-height:1.55;color:#5c6c7d;">
                        Se o botão não abrir, copie e cole este link no navegador:
                      </p>
                      <p style="margin:0;font-size:12px;line-height:1.45;word-break:break-all;color:#2f4258;">
                        ${escapedLink}
                      </p>
                    </td>
                  </tr>
                </table>
                <p style="margin:14px 0 0;font-size:12px;line-height:1.55;color:#738394;">
                  Mensagem automática enviada por ${escapeHtml(brandName)}.
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

function buildVerificationEmailText(input: VerificationEmailInput): string {
  const brandName = resolveBrandName();
  const recipient = input.name || "cliente";

  return [
    `Olá, ${recipient}.`,
    "",
    `Confirme seu e-mail para liberar o acesso completo na plataforma ${brandName}.`,
    "",
    `Link de verificação: ${input.verificationLink}`,
    "",
    `Mensagem automática do sistema ${brandName}.`
  ].join("\n");
}

export function isCustomVerificationEmailEnabled(): boolean {
  if (env.NODE_ENV === "test" || process.env.VITEST) {
    return false;
  }

  return Boolean(env.SENDGRID_API_KEY.trim() && env.EMAIL_FROM.trim());
}

function buildSendGridTemplateData(input: VerificationEmailInput) {
  const brandName = resolveBrandName();

  return {
    brand_name: brandName,
    recipient_name: input.name || "cliente",
    verification_link: input.verificationLink,
    support_email: env.EMAIL_REPLY_TO || env.EMAIL_FROM,
    tagline: "O Doutor da Sua Causa é Você.",
    cta_label: "Confirmar e-mail",
    footer_text: `Mensagem automática enviada por ${brandName}.`
  };
}

export async function sendCustomVerificationEmail(input: VerificationEmailInput): Promise<void> {
  const apiKey = env.SENDGRID_API_KEY.trim();
  const fromRaw = env.EMAIL_FROM.trim();
  const replyToRaw = env.EMAIL_REPLY_TO.trim();
  const templateId = env.SENDGRID_TEMPLATE_ID.trim();
  const from = parseSender(fromRaw);
  const replyTo = replyToRaw ? parseSender(replyToRaw) : undefined;
  const brandName = resolveBrandName();

  if (!apiKey || !fromRaw) {
    throw new Error("Custom verification sender is not configured.");
  }

  const basePayload = {
    personalizations: [
      {
        to: [{ email: input.email }],
        ...(templateId
          ? {
              dynamic_template_data: buildSendGridTemplateData(input)
            }
          : {})
      }
    ],
    from,
    ...(replyTo ? { reply_to: replyTo } : {})
  };

  const payload = templateId
    ? {
        ...basePayload,
        template_id: templateId
      }
    : {
        ...basePayload,
        subject: `Confirme seu e-mail - ${brandName}`,
        content: [
          {
            type: "text/plain",
            value: buildVerificationEmailText(input)
          },
          {
            type: "text/html",
            value: buildVerificationEmailHtml(input)
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
    throw new Error(`SendGrid rejected verification email (${response.status}). ${details}`);
  }
}
