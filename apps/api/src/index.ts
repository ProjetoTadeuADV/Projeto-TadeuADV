import { createApp } from "./app.js";
import { env, getEmailDeliverabilityWarnings } from "./config/env.js";

const app = createApp();

app.listen(env.PORT, () => {
  const emailWarnings = getEmailDeliverabilityWarnings();
  for (const warning of emailWarnings) {
    console.warn(`[email-deliverability] ${warning}`);
  }

  console.log(`API rodando na porta ${env.PORT}`);
});
