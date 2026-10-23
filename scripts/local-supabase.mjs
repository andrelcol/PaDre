import { spawn } from 'node:child_process'
import { createHmac, randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import EmbeddedPostgres from 'embedded-postgres'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtimeDir = path.join(rootDir, 'supabase', '.runtime')
const dataDir = path.join(runtimeDir, 'data')
const logFile = path.join(runtimeDir, 'supervisor.log')
const pidFile = path.join(runtimeDir, 'supervisor.pid')
const secretFile = path.join(runtimeDir, 'secrets.json')
const envFile = path.join(rootDir, '.env.local')
const migrationsDir = path.join(rootDir, 'supabase', 'migrations')

const dbPort = 54322
const apiPort = 54321
const authPort = 59999
const restPort = 59998
const mailHttpPort = 54324
const mailSmtpPort = 54325
const forbiddenPort = 5432

const corsHeaders =
  'authorization, apikey, content-type, x-client-info, x-supabase-api-version, prefer, accept, accept-profile, content-profile'
const siteUrl = 'http://127.0.0.1:5173'
const apiUrl = `http://127.0.0.1:${apiPort}`
const authExternalUrl = `${apiUrl}/auth/v1`
const allowedOrigins = new Set([
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'https://localhost',
  'http://localhost',
  'capacitor://localhost',
])

if (dbPort === forbiddenPort) {
  throw new Error('O Postgres do PaDre não pode usar a porta 5432.')
}

const command = process.argv[2] ?? 'start'

if (command === 'supervise') {
  await supervise()
} else if (command === 'start') {
  await start()
} else if (command === 'stop') {
  await stop()
} else if (command === 'status') {
  await status()
} else if (command === 'reset') {
  await stop()
  await fs.rm(dataDir, { recursive: true, force: true })
  await start()
} else if (command === 'types') {
  await generateTypes()
} else {
  console.error('Use start, stop, status, reset ou types.')
  process.exit(1)
}

async function start() {
  if (await supervisorAlive()) {
    console.log(`Supabase local já está em execução (${apiUrl}).`)
    return
  }

  await assertPortAvailable(dbPort)
  await assertPortAvailable(apiPort)
  await fs.mkdir(runtimeDir, { recursive: true })
  const log = await fs.open(logFile, 'a')
  const child = spawn(
    process.execPath,
    [fileURLToPath(import.meta.url), 'supervise'],
    {
      cwd: rootDir,
      detached: true,
      stdio: ['ignore', log.fd, log.fd],
    },
  )
  child.unref()
  log.close()

  const childPid = child.pid
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (await healthOk()) {
      console.log(`Supabase local pronto em ${apiUrl}`)
      console.log('A chave anônima foi escrita em .env.local.')
      return
    }
    if (!processAlive(childPid)) {
      break
    }
    await delay(500)
  }

  console.error(
    'O Supabase local não ficou pronto. Veja supabase/.runtime/supervisor.log.',
  )
  process.exit(1)
}

async function stop() {
  const pid = await readPid()
  if (!pid) {
    console.log('Supabase local não está em execução.')
    return
  }

  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    await fs.rm(pidFile, { force: true })
    console.log('Supabase local não está em execução.')
    return
  }

  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (!processAlive(pid)) {
      console.log('Supabase local encerrado.')
      return
    }
    await delay(200)
  }

  process.kill(pid, 'SIGKILL')
  console.log('Supabase local encerrado.')
}

async function status() {
  const alive = await supervisorAlive()
  console.log(alive ? `em execução ${apiUrl}` : 'parado')
  process.exit(alive ? 0 : 1)
}

async function supervise() {
  await fs.mkdir(runtimeDir, { recursive: true })
  await fs.writeFile(pidFile, String(process.pid))
  const secrets = await loadSecrets()
  const children = []
  let shuttingDown = false
  const postgres = new EmbeddedPostgres({
    databaseDir: dataDir,
    port: dbPort,
    user: 'postgres',
    password: secrets.postgresPassword,
    authMethod: 'scram-sha-256',
    persistent: true,
    initdbFlags: ['--locale=C', '--encoding=UTF8'],
    postgresFlags: ['-c', 'listen_addresses=127.0.0.1'],
    onLog: () => {},
    onError: (error) => {
      console.error(error)
    },
  })

  const shutdown = async () => {
    if (shuttingDown) return
    shuttingDown = true
    for (const child of children.reverse()) {
      child.kill('SIGTERM')
    }
    await postgres.stop().catch(() => undefined)
    await fs.rm(pidFile, { force: true })
    process.exit(0)
  }

  const track = (child, name) => {
    children.push(child)
    child.on('exit', (code, signal) => {
      if (shuttingDown) return
      console.error(`${name} encerrou (${signal ?? code}).`)
      void shutdown()
    })
  }

  process.on('SIGTERM', () => {
    void shutdown()
  })
  process.on('SIGINT', () => {
    void shutdown()
  })

  try {
    if (!existsSync(path.join(dataDir, 'PG_VERSION'))) {
      await postgres.initialise()
    }
    await postgres.start()
    await ensureRoles(secrets)
    await startMailpit(track)
    await migrateAuth(secrets)
    await startAuth(secrets, track)
    await waitForAuthUsers()
    await applyMigrations(secrets)
    await startRest(secrets, track)
    await startGateway(secrets)
    await writeEnv(secrets)
    console.log('supervisor ready')
  } catch (error) {
    console.error(error)
    await shutdown()
  }

  await new Promise(() => {})
}

async function loadSecrets() {
  if (existsSync(secretFile)) {
    const secrets = JSON.parse(await fs.readFile(secretFile, 'utf8'))
    if (!secrets.anonKey) {
      secrets.anonKey = anonKey(secrets.jwtSecret)
      await fs.writeFile(secretFile, JSON.stringify(secrets, null, 2), {
        mode: 0o600,
      })
    }
    return secrets
  }

  const jwtSecret = `padre-local-${randomBytes(24).toString('hex')}!`
  const secrets = {
    postgresPassword: randomBytes(24).toString('hex'),
    authenticatorPassword: randomBytes(24).toString('hex'),
    jwtSecret,
    anonKey: anonKey(jwtSecret),
  }
  await fs.writeFile(secretFile, JSON.stringify(secrets, null, 2), {
    mode: 0o600,
  })
  return secrets
}

function anonKey(jwtSecret) {
  const now = Math.floor(Date.now() / 1000)
  return signJwt(
    {
      role: 'anon',
      iss: 'supabase',
      iat: now,
      exp: now + 60 * 60 * 24 * 365 * 5,
    },
    jwtSecret,
  )
}

function signJwt(payload, secret) {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url')
  return `${header}.${body}.${signature}`
}

async function ensureRoles(secrets) {
  const client = new pg.Client({
    host: '127.0.0.1',
    port: dbPort,
    user: 'postgres',
    password: secrets.postgresPassword,
    database: 'postgres',
  })
  await client.connect()
  try {
    await client.query(`
      do $$
      begin
        if not exists (select 1 from pg_roles where rolname = 'anon') then
          create role anon nologin noinherit;
        end if;
        if not exists (select 1 from pg_roles where rolname = 'authenticated') then
          create role authenticated nologin noinherit;
        end if;
        if not exists (select 1 from pg_roles where rolname = 'service_role') then
          create role service_role nologin noinherit bypassrls;
        end if;
        if not exists (select 1 from pg_roles where rolname = 'authenticator') then
          create role authenticator noinherit login password '${secrets.authenticatorPassword}';
        end if;
      end
      $$;

      grant anon, authenticated, service_role to authenticator;
      grant usage on schema public to anon, authenticated, authenticator;
      create schema if not exists auth;
      grant usage on schema auth to postgres, authenticator, anon, authenticated;

      alter role postgres set search_path to auth, public;
      alter role authenticator set search_path to public;
      alter role anon set search_path to public;
      alter role authenticated set search_path to public;
    `)
    await client.query(`
      do $repair$
      begin
        if to_regclass('public.schema_migrations') is not null
          and to_regclass('auth.schema_migrations') is not null then
          insert into auth.schema_migrations (version)
          select version from public.schema_migrations
          on conflict do nothing;
        end if;
      end
      $repair$;
    `)
  } finally {
    await client.end()
  }
}

function startMailpit(track) {
  const child = spawn(
    path.join(rootDir, '.tools/bin/mailpit'),
    [
      '--listen',
      `127.0.0.1:${mailHttpPort}`,
      '--smtp',
      `127.0.0.1:${mailSmtpPort}`,
    ],
    { stdio: 'inherit' },
  )
  track(child, 'mailpit')
}

function authEnv(secrets) {
  return {
    ...process.env,
    GOTRUE_API_HOST: '127.0.0.1',
    GOTRUE_API_PORT: String(authPort),
    API_EXTERNAL_URL: authExternalUrl,
    GOTRUE_API_API_EXTERNAL_URL: authExternalUrl,
    GOTRUE_API_EXTERNAL_URL: authExternalUrl,
    GOTRUE_DB_DRIVER: 'postgres',
    GOTRUE_DB_DATABASE_URL: databaseUrl(secrets),
    GOTRUE_DB_MIGRATIONS_PATH: path.join(rootDir, '.tools/auth/migrations'),
    GOTRUE_SITE_URL: siteUrl,
    GOTRUE_URI_ALLOW_LIST: [
      `${siteUrl}/redefinir-senha`,
      `${siteUrl}/**`,
      'http://localhost:5173/redefinir-senha',
      'http://localhost:5173/**',
    ].join(','),
    GOTRUE_JWT_SECRET: secrets.jwtSecret,
    GOTRUE_JWT_EXP: '3600',
    GOTRUE_JWT_AUD: 'authenticated',
    GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated',
    GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true',
    GOTRUE_MAILER_AUTOCONFIRM: 'true',
    GOTRUE_MAILER_SECURE_EMAIL_CHANGE_ENABLED: 'false',
    GOTRUE_MAILER_URLPATHS_RECOVERY: '/redefinir-senha',
    GOTRUE_SMTP_HOST: '127.0.0.1',
    GOTRUE_SMTP_PORT: String(mailSmtpPort),
    GOTRUE_SMTP_ADMIN_EMAIL: 'noreply@padre.local',
    GOTRUE_SMTP_SENDER_NAME: 'PaDre',
    GOTRUE_SMTP_MAX_FREQUENCY: '1s',
    GOTRUE_DISABLE_SIGNUP: 'false',
    GOTRUE_PASSWORD_MIN_LENGTH: '8',
    GOTRUE_RATE_LIMIT_EMAIL_SENT: '1000',
  }
}

function migrateAuth(secrets) {
  return new Promise((resolve, reject) => {
    const child = spawn(path.join(rootDir, '.tools/auth/auth'), ['migrate'], {
      cwd: path.join(rootDir, '.tools/auth'),
      stdio: 'inherit',
      env: authEnv(secrets),
    })
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`auth migrate saiu com código ${code}.`))
    })
  })
}

async function startAuth(secrets, track) {
  const child = spawn(path.join(rootDir, '.tools/auth/auth'), ['serve'], {
    cwd: path.join(rootDir, '.tools/auth'),
    stdio: 'inherit',
    env: authEnv(secrets),
  })
  track(child, 'auth')
  await waitForTcp(authPort)
}

async function startRest(secrets, track) {
  const configPath = path.join(runtimeDir, 'postgrest.conf')
  const config = [
    `db-uri = "${databaseUrl(secrets, 'authenticator')}"`,
    'db-schemas = "public"',
    'db-anon-role = "anon"',
    'db-extra-search-path = "public"',
    `server-host = "127.0.0.1"`,
    `server-port = ${restPort}`,
    `jwt-secret = "${secrets.jwtSecret}"`,
    'jwt-secret-is-base64 = false',
  ].join('\n')
  await fs.writeFile(configPath, config)
  const child = spawn(
    path.join(rootDir, '.tools/bin/postgrest'),
    [configPath],
    {
      stdio: 'inherit',
    },
  )
  track(child, 'postgrest')
  await waitForTcp(restPort)
}

function startGateway(secrets) {
  const key = secrets.anonKey
  const server = http.createServer((request, response) => {
    const origin = request.headers.origin
    if (request.method === 'OPTIONS') {
      writeCors(response, origin)
      response.writeHead(204)
      response.end()
      return
    }

    if (request.headers.apikey && request.headers.apikey !== key) {
      writeCors(response, origin)
      response.writeHead(401, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ message: 'Chave de API inválida.' }))
      return
    }

    const url = new URL(request.url ?? '/', apiUrl)
    if (url.pathname === '/redefinir-senha' && url.searchParams.has('token')) {
      proxy(request, response, authPort, '/auth/v1', `/verify${url.search}`)
      return
    }
    if (url.pathname.startsWith('/auth/v1')) {
      proxy(request, response, authPort, '/auth/v1')
      return
    }
    if (url.pathname.startsWith('/rest/v1')) {
      proxy(request, response, restPort, '/rest/v1')
      return
    }

    writeCors(response, origin)
    response.writeHead(404, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ message: 'Rota não encontrada.' }))
  })

  server.listen(apiPort, '127.0.0.1')
}

function proxy(request, response, port, prefix, pathOverride) {
  const url = new URL(request.url ?? '/', apiUrl)
  const stripped =
    pathOverride ?? `${url.pathname.slice(prefix.length) || '/'}${url.search}`
  const headers = { ...request.headers, host: `127.0.0.1:${port}` }
  const upstream = http.request(
    {
      hostname: '127.0.0.1',
      port,
      method: request.method,
      path: pathOverride ?? `${stripped}`,
      headers,
    },
    (upstreamResponse) => {
      const headers = { ...upstreamResponse.headers }
      const origin = request.headers.origin
      if (typeof origin === 'string' && allowedOrigins.has(origin)) {
        headers['access-control-allow-origin'] = origin
        headers.vary = 'origin'
      }
      headers['access-control-allow-headers'] = corsHeaders
      headers['access-control-allow-methods'] =
        'GET, POST, PUT, PATCH, DELETE, OPTIONS'
      response.writeHead(upstreamResponse.statusCode ?? 502, headers)
      upstreamResponse.pipe(response)
    },
  )
  upstream.on('error', () => {
    if (!response.headersSent) {
      response.writeHead(502)
    }
    response.end()
  })
  request.pipe(upstream)
}

function writeCors(response, origin) {
  if (typeof origin === 'string' && allowedOrigins.has(origin)) {
    response.setHeader('access-control-allow-origin', origin)
    response.setHeader('vary', 'origin')
  }
  response.setHeader('access-control-allow-headers', corsHeaders)
  response.setHeader(
    'access-control-allow-methods',
    'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  )
}

async function applyMigrations(secrets) {
  const client = new pg.Client({
    host: '127.0.0.1',
    port: dbPort,
    user: 'postgres',
    password: secrets.postgresPassword,
    database: 'postgres',
  })
  await client.connect()
  try {
    await client.query(`
      create schema if not exists supabase_migrations;
      create table if not exists supabase_migrations.schema_migrations (
        version text primary key,
        name text not null,
        applied_at timestamptz not null default now()
      );
    `)
    const files = (await fs.readdir(migrationsDir))
      .filter((file) => file.endsWith('.sql'))
      .sort()
    for (const file of files) {
      const version = file.split('_')[0] ?? file
      const existing = await client.query(
        'select 1 from supabase_migrations.schema_migrations where version = $1',
        [version],
      )
      if (existing.rowCount) continue
      const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8')
      await client.query('begin')
      try {
        await client.query(sql)
        await client.query(
          'insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)',
          [version, file],
        )
        await client.query('commit')
      } catch (error) {
        await client.query('rollback')
        throw error
      }
    }
  } finally {
    await client.end()
  }
}

async function waitForAuthUsers() {
  const secrets = await loadSecrets()
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const client = new pg.Client({
      host: '127.0.0.1',
      port: dbPort,
      user: 'postgres',
      password: secrets.postgresPassword,
      database: 'postgres',
    })
    try {
      await client.connect()
      const result = await client.query(
        `select to_regclass('auth.users') as users`,
      )
      if (result.rows[0]?.users) return
    } catch {
      // GoTrue ainda está migrando.
    } finally {
      await client.end().catch(() => undefined)
    }
    await delay(300)
  }
  throw new Error('auth.users não ficou disponível.')
}

async function writeEnv(secrets) {
  const contents = [
    '# Gerado por npm run supabase:start. Não commitar.',
    `VITE_SUPABASE_URL=${apiUrl}`,
    `VITE_SUPABASE_ANON_KEY=${secrets.anonKey}`,
    'VITE_SUPABASE_URL_ANDROID=http://10.0.2.2:54321',
    'VITE_PUBLIC_WEB_ORIGIN=http://127.0.0.1:5173',
    `DATABASE_URL=${databaseUrl(secrets)}`,
    '',
  ].join('\n')
  await fs.writeFile(envFile, contents, { mode: 0o600 })
}

function databaseUrl(secrets, user = 'postgres') {
  const password =
    user === 'postgres'
      ? secrets.postgresPassword
      : secrets.authenticatorPassword
  return `postgresql://${user}:${password}@127.0.0.1:${dbPort}/postgres`
}

async function generateTypes() {
  if (!(await healthOk())) {
    throw new Error('Inicie o Supabase local antes de gerar os tipos.')
  }
  const secrets = JSON.parse(await fs.readFile(secretFile, 'utf8'))
  const output = path.join(rootDir, 'src/shared/lib/database.types.ts')
  await new Promise((resolve, reject) => {
    const child = spawn(
      path.join(rootDir, 'node_modules/.bin/supabase'),
      [
        'gen',
        'types',
        'typescript',
        '--db-url',
        databaseUrl(secrets),
        '--schema',
        'public',
      ],
      { cwd: rootDir, stdio: ['ignore', 'pipe', 'inherit'] },
    )
    const chunks = []
    child.stdout.on('data', (chunk) => chunks.push(chunk))
    child.on('exit', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks).toString('utf8'))
      else reject(new Error('supabase gen types falhou'))
    })
  }).then(async (types) => {
    await fs.writeFile(output, types)
    console.log(`Tipos escritos em ${output}`)
  })
}

async function healthOk() {
  try {
    const secrets = existsSync(secretFile)
      ? JSON.parse(await fs.readFile(secretFile, 'utf8'))
      : null
    if (!secrets) return false
    const response = await fetch(`${apiUrl}/auth/v1/health`, {
      headers: { apikey: secrets.anonKey },
    })
    return response.ok
  } catch {
    return false
  }
}

async function supervisorAlive() {
  const pid = await readPid()
  return pid ? processAlive(pid) : false
}

async function readPid() {
  try {
    const value = Number(await fs.readFile(pidFile, 'utf8'))
    return Number.isInteger(value) ? value : null
  } catch {
    return null
  }
}

function processAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function assertPortAvailable(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', () => {
      reject(
        new Error(
          `A porta ${port} já está em uso. O PaDre não vai reutilizar outro banco.`,
        ),
      )
    })
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve())
    })
  })
}

function waitForTcp(port) {
  const deadline = Date.now() + 30_000
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect(port, '127.0.0.1')
      socket.once('connect', () => {
        socket.end()
        resolve()
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() > deadline)
          reject(new Error(`A porta ${port} não abriu.`))
        else setTimeout(attempt, 200)
      })
    }
    attempt()
  })
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
