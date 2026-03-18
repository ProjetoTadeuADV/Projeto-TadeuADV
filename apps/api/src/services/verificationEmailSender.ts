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
      throw new Error("EMAIL_FROM precisa conter um endereco de e-mail valido.");
    }

    return name ? { email, name } : { email };
  }

  if (!normalized.includes("@")) {
    throw new Error("EMAIL_FROM precisa conter um endereco de e-mail valido.");
  }

  return { email: normalized };
}

function buildLogoMarkup(brandName: string): string {
  if (!env.EMAIL_LOGO_URL) {
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

function resolvePlatformUrl(): string | null {
  const raw = env.VERIFY_EMAIL_CONTINUE_URL.trim();
  if (!raw) {
    return null;
  }

  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function buildVerificationEmailHtml(input: VerificationEmailInput): string {
  const brandName = resolveBrandName();
  const recipient = input.name ? escapeHtml(input.name) : "cliente";
  const escapedLink = escapeHtml(input.verificationLink);
  const supportEmail = escapeHtml(resolveSupportEmail());
  const platformUrl = resolvePlatformUrl();
  const escapedPlatformUrl = platformUrl ? escapeHtml(platformUrl) : "";
  const platformLinkMarkup = platformUrl
    ? `<a href="${escapedPlatformUrl}" target="_blank" rel="noopener noreferrer" style="color:#0b4d90;text-decoration:none;font-weight:600;">Acessar plataforma</a>`
    : "Acessar plataforma";

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Confirmacao de e-mail</title>
  </head>
  <body style="margin:0;padding:0;background:#eef2f7;font-family:Arial,sans-serif;color:#1f2b36;">
    <span style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">
      Confirme seu e-mail para liberar seu acesso ao painel ${escapeHtml(brandName)}.
    </span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eef2f7;padding:24px 10px;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #d5dfec;">
            <tr>
              <td style="padding:22px 24px;background:linear-gradient(96deg,#02294f 0%,#003b77 56%,#0b4d90 100%);">
                ${buildLogoMarkup(brandName)}
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:#526377;">
                  Conta criada com sucesso na plataforma ${escapeHtml(brandName)}.
                </p>
                <h1 style="margin:0 0 14px;font-family:Montserrat,Arial,sans-serif;font-size:29px;line-height:1.15;color:#003366;">
                  Confirmar e-mail
                </h1>
                <p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#2f4358;">
                  Ola, ${recipient}. Para liberar seu acesso, confirme o e-mail desta conta.
                </p>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#2f4358;">
                  Se voce nao solicitou esse cadastro, pode ignorar esta mensagem com seguranca.
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
              <td style="padding:0 24px 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f7faff;border:1px solid #d7e2f0;border-radius:12px;">
                  <tr>
                    <td style="padding:12px 14px;">
                      <p style="margin:0 0 8px;font-size:12px;line-height:1.55;color:#55687c;">
                        Se o botao nao abrir, copie este link e cole no navegador:
                      </p>
                      <p style="margin:0;font-size:12px;line-height:1.45;word-break:break-all;color:#25384c;">
                        ${escapedLink}
                      </p>
                    </td>
                  </tr>
                </table>
                <p style="margin:14px 0 0;font-size:12px;line-height:1.55;color:#677b8f;">
                  Este e-mail foi enviado automaticamente por ${escapeHtml(brandName)}.
                </p>
                <p style="margin:6px 0 0;font-size:12px;line-height:1.55;color:#677b8f;">
                  Suporte: <a href="mailto:${supportEmail}" style="color:#0b4d90;text-decoration:none;">${supportEmail}</a>
                </p>
                <p style="margin:6px 0 0;font-size:12px;line-height:1.55;color:#677b8f;">
                  ${platformLinkMarkup}
                </p>
                <p style="margin:10px 0 0;font-size:11px;line-height:1.55;color:#7a8b9b;">
                  Voce recebeu esta mensagem porque existe uma conta cadastrada com este endereco de e-mail.
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
  const supportEmail = resolveSupportEmail();
  const platformUrl = resolvePlatformUrl();

  return [
    `Ola, ${recipient}.`,
    "",
    `Confirme seu e-mail para liberar seu acesso na plataforma ${brandName}.`,
    "",
    `Link de verificacao: ${input.verificationLink}`,
    "",
    "Se voce nao solicitou esse cadastro, ignore esta mensagem.",
    "",
    `Suporte: ${supportEmail}`,
    ...(platformUrl ? ["", `Plataforma: ${platformUrl}`] : []),
    "",
    `Mensagem automatica do sistema ${brandName}.`
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
  const supportEmail = resolveSupportEmail();
  const platformUrl = resolvePlatformUrl();

  return {
    brand_name: brandName,
    recipient_name: input.name || "cliente",
    verification_link: input.verificationLink,
    support_email: supportEmail,
    platform_url: platformUrl ? `Plataforma: ${platformUrl}` : "",
    tagline: "Conta criada com sucesso.",
    cta_label: "Confirmar e-mail",
    footer_text: `Mensagem automatica enviada por ${brandName}.`
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
        custom_args: {
          message_type: "verification"
        },
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
        subject: `[${brandName}] Confirmacao de e-mail`,
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

  const payloadWithDeliverability = {
    ...payload,
    categories: ["transactional", "verification"],
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
    body: JSON.stringify(payloadWithDeliverability)
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`SendGrid rejected verification email (${response.status}). ${details}`);
  }
}
