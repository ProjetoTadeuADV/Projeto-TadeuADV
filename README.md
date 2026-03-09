# Plataforma JEC MVP (Web + API)

MVP funcional para abertura e acompanhamento de casos jurídicos com:

- Frontend `React + Vite` (Vercel)
- API `Node.js + Express` (Railway)
- `Firebase Auth` (login por e-mail/senha)
- `Firestore` (persistência de usuários e casos)
- Consulta de CPF via adaptador mock (`source: "mock"`)

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

1. Instalar dependências:

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
- `npm run test` -> testes da API (unit + integração)

## Endpoints

- `GET /v1/health`
- `GET /v1/varas`
- `POST /v1/cpf/consulta` (auth)
- `POST /v1/users/profile` (auth)
- `POST /v1/cases` (auth)
- `GET /v1/cases` (auth)
- `GET /v1/cases/:id` (auth)

## Deploy no Vercel (frontend)

1. Importar repo no Vercel.
2. Definir Root Directory: `apps/web`.
3. Build command: `npm run build`.
4. Output Directory: `dist`.
5. Configurar variáveis:
   - `VITE_API_URL`
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`

## Deploy no Railway (API)

1. Criar serviço a partir do mesmo repo.
2. Definir Root Directory: `apps/api`.
3. Build command: `npm run build`.
4. Start command: `npm run start`.
5. Configurar variáveis:
   - `NODE_ENV=production`
   - `PORT=8080`
   - `CORS_ORIGIN=https://SEU_APP.vercel.app`
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY` (com `\n` escapado)
   - `MOCK_CPF_DEFAULT_NAME` (opcional)

## Configuração Firebase

1. Ativar Email/Password em Authentication.
2. Criar Firestore em modo produção.
3. Criar Service Account (Admin SDK) e usar as credenciais nas variáveis da API.

## Smoke test (produção)

1. Criar conta no frontend.
2. Confirmar acesso ao dashboard.
3. Abrir novo caso com `vara + CPF + resumo`.
4. Confirmar listagem no dashboard e abertura do detalhe.
5. Conferir `GET /v1/health` da API.

