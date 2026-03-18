# Plataforma JEC MVP (Web + API)

MVP funcional para abertura e acompanhamento de casos juridicos com:

- Frontend `React + Vite` (Vercel)
- API `Node.js + Express` (Railway)
- `Firebase Auth` (login por e-mail/senha)
- `Firestore` (persistencia de usuarios e casos)
- Consulta de CPF via adaptador mock (`source: "mock"`)
- Integracao de cobranca inicial via Asaas (cliente + boleto)

## Estrutura

```text
apps/
  web/  -> SPA React (Vite)
  api/  -> API Express (TypeScript)
```

## Requisitos

- Node.js 20+
- Projeto Firebase criado (Auth + Firestore)
- Conta Vercel e Railway

## Setup local

1. Instalar dependencias:

```bash
npm install
```

2. Configurar ambiente:

- Copiar `apps/api/.env.example` para `apps/api/.env`
- Copiar `apps/web/.env.example` para `apps/web/.env`

3. Rodar API:

```bash
npm run dev:api
```

4. Rodar frontend:

```bash
npm run dev:web
```

Frontend: `http://localhost:5173`  
API: `http://localhost:8080`

## Scripts

- `npm run dev:web` -> frontend
- `npm run dev:api` -> API
- `npm run build` -> build de `web` + `api`
- `npm run test` -> testes da API (unit + integracao)
- `npm run check:web-env` -> valida `VITE_API_URL` antes de deploy
- `npm run check:live -- <url-do-front> [url-da-api-esperada]` -> valida configuracao no ar e `GET /v1/health`

## Endpoints

- `GET /v1/health`
- `GET /v1/varas`
- `POST /v1/cpf/consulta` (auth)
- `POST /v1/users/profile` (auth)
- `POST /v1/cases` (auth)
- `GET /v1/cases` (auth)
- `GET /v1/cases/:id` (auth)
- `GET /v1/cases/:id/peticao-inicial.pdf` (auth, exportacao PDF)

`POST /v1/cases` aceita bloco opcional `petitionInitial` com dados estruturados:
- `claimSubject`, `claimantAddress`
- `defendantType`, `defendantName`, `defendantDocument`, `defendantAddress`
- `facts`, `legalGrounds`, `requests[]`, `evidence`, `claimValue`, `hearingInterest`

## Deploy no Vercel (frontend)

1. Importar repo no Vercel.
2. Definir Root Directory: `apps/web`.
3. Build command: `npm run build`.
4. Output Directory: `dist`.
5. Configurar variaveis:
   - `VITE_API_URL`
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
6. `VITE_API_URL` precisa apontar para o backend real no ar (nao usar `localhost` ou placeholder).

## Deploy no Railway (API)

1. Criar servico a partir do mesmo repo.
2. Definir Root Directory: `apps/api`.
3. Build command: `npm run build`.
4. Start command: `npm run start`.
5. Configurar variaveis:
   - `NODE_ENV=production`
   - `PORT=8080`
   - `CORS_ORIGIN=https://SEU_APP.vercel.app`
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY` (com `\n` escapado)
   - `MOCK_CPF_DEFAULT_NAME` (opcional)
   - `ASAAS_API_KEY`
   - `ASAAS_BASE_URL` (`https://api.asaas.com/v3` producao ou `https://api-sandbox.asaas.com/v3` sandbox)
   - `ASAAS_USER_AGENT` (opcional)
6. Nao usar valores locais/placeholder em producao (`localhost`, `SEU_APP`, `SUA_API` etc).

## Alinhamento local x producao (obrigatorio)

1. Defina a mesma origem de dados do Firebase (mesmo projeto) para backend local e backend no ar.
2. Garanta que o frontend no ar use a API correta:

```bash
npm run check:live -- https://SEU_FRONT.vercel.app https://SUA_API_REAL.up.railway.app
```

3. Se houver divergencia no comando acima, atualize `VITE_API_URL` no Vercel e faca redeploy.
4. Valide o backend no ar:

```bash
curl https://SUA_API_REAL.up.railway.app/v1/health
```

5. Somente depois rode smoke test de cadastro/login/casos em producao.

## Configuracao Firebase

1. Ativar Email/Password em Authentication.
2. Criar Firestore em modo producao.
3. Criar Service Account (Admin SDK) e usar as credenciais nas variaveis da API.

## Smoke test (producao)

1. Criar conta no frontend.
2. Confirmar acesso ao dashboard.
3. Abrir novo caso com `vara + CPF + resumo`.
4. Confirmar listagem no dashboard e abertura do detalhe.
5. Conferir `GET /v1/health` da API.
