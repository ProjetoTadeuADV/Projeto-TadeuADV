import process from "node:process";

const KNOWN_NON_API_HOSTS = new Set([
  "reactjs.org",
  "www.google.com",
  "apis.google.com",
  "firebase.google.com",
  "www.apache.org",
  "www.w3.org"
]);

function fail(message, code = 1) {
  console.error(`[live-check] ${message}`);
  process.exit(code);
}

function info(message) {
  console.log(`[live-check] ${message}`);
}

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index < 0) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function getPositionalArgs() {
  return process.argv.slice(2).filter((item) => !item.startsWith("--"));
}

function normalizeUrl(value) {
  return value.trim().replace(/\/+$/, "");
}

function extractAssetScriptUrl(html, baseUrl) {
  const match = html.match(/<script[^>]+src="([^"]*\/assets\/index-[^"]+\.js)"/i);
  if (!match?.[1]) {
    return null;
  }

  return new URL(match[1], baseUrl).toString();
}

function extractFirebaseProjectId(bundle) {
  const match = bundle.match(/projectId:"([^"]+)"/);
  return match?.[1] ?? null;
}

function extractApiBaseUrl(bundle) {
  const fetchTemplateMatch = bundle.match(/fetch\(`\$\{([A-Za-z0-9_$]+)\}\$\{[A-Za-z0-9_$]+\}`/);
  if (fetchTemplateMatch?.[1]) {
    const variableName = fetchTemplateMatch[1];
    const assignmentRegex = new RegExp(
      `(?:const|let|var)\\s+${variableName}\\s*=\\s*\"(https?:\\\\/\\\\/[^\\\"]+)\"`
    );
    const assignmentMatch = bundle.match(assignmentRegex);
    if (assignmentMatch?.[1]) {
      return assignmentMatch[1].replace(/\\\\\//g, "/");
    }
  }

  const explicitMatch = bundle.match(
    /const\s+[A-Za-z0-9_$]+\s*=\s*"(https?:\/\/[^"]+)";class\s+[A-Za-z0-9_$]+\s+extends\s+Error/
  );
  if (explicitMatch?.[1]) {
    return explicitMatch[1];
  }

  const genericMatches = [...bundle.matchAll(/"https?:\/\/[^"]+"/g)]
    .map((item) => item[0].slice(1, -1))
    .filter((url) => {
      try {
        const parsed = new URL(url);
        return !KNOWN_NON_API_HOSTS.has(parsed.hostname.toLowerCase()) && !parsed.hostname.endsWith("firebaseapp.com");
      } catch {
        return false;
      }
    });

  const unique = Array.from(new Set(genericMatches));
  return unique.length === 1 ? unique[0] : null;
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    fail(`Falha ao acessar ${url} (HTTP ${response.status}).`);
  }

  return response.text();
}

async function checkApiHealth(apiBaseUrl) {
  const healthUrl = `${normalizeUrl(apiBaseUrl)}/v1/health`;
  let response;
  try {
    response = await fetch(healthUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    return {
      healthUrl,
      status: -1,
      ok: false,
      error: message
    };
  }

  return {
    healthUrl,
    status: response.status,
    ok: response.ok,
    error: null
  };
}

async function main() {
  const positionalArgs = getPositionalArgs();
  const webUrlRaw = getArgValue("--web-url") ?? positionalArgs[0] ?? null;
  const expectedApiRaw = getArgValue("--expected-api") ?? positionalArgs[1] ?? null;

  if (!webUrlRaw) {
    fail(
      "Uso: npm run check:live --workspace apps/web -- --web-url https://seu-front.vercel.app [--expected-api https://sua-api.up.railway.app] (ou passe como parametros posicionais)"
    );
  }

  let webUrl;
  try {
    webUrl = new URL(webUrlRaw);
  } catch {
    fail(`--web-url invalida: ${webUrlRaw}`);
  }

  info(`Lendo frontend publicado em ${webUrl.toString()}`);
  const html = await fetchText(webUrl.toString());
  const assetUrl = extractAssetScriptUrl(html, webUrl.toString());
  if (!assetUrl) {
    fail("Nao foi possivel localizar o bundle principal no HTML publicado.");
  }

  info(`Bundle encontrado: ${assetUrl}`);
  const bundle = await fetchText(assetUrl);

  const apiBaseUrl = extractApiBaseUrl(bundle);
  if (!apiBaseUrl) {
    fail("Nao foi possivel extrair a API base URL do bundle publicado.");
  }

  info(`API base URL no ar: ${apiBaseUrl}`);
  const firebaseProjectId = extractFirebaseProjectId(bundle);
  if (firebaseProjectId) {
    info(`Firebase projectId no ar: ${firebaseProjectId}`);
  }

  if (expectedApiRaw) {
    const expectedApi = normalizeUrl(expectedApiRaw);
    if (normalizeUrl(apiBaseUrl) !== expectedApi) {
      fail(
        `Divergencia detectada: esperado ${expectedApi}, mas bundle usa ${apiBaseUrl}.`,
        2
      );
    }
  }

  const health = await checkApiHealth(apiBaseUrl);
  if (!health.ok) {
    if (health.status === -1) {
      fail(`Healthcheck falhou: ${health.healthUrl} (${health.error}).`, 3);
    }

    fail(`Healthcheck falhou: ${health.healthUrl} retornou HTTP ${health.status}.`, 3);
  }

  info(`Healthcheck OK: ${health.healthUrl} (HTTP ${health.status})`);
}

await main();
