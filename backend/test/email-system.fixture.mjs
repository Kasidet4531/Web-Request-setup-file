import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer, request as proxyRequest } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { chromium } from 'playwright';
import { expect } from 'playwright/test';
import { SaxesParser } from 'saxes';

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const frontendDist = resolve(backendRoot, '../frontend/dist');
const soapEnvelope = (body) =>
  `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${body}</soap:Body></soap:Envelope>`;

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}

async function freePort() {
  const server = createServer();
  const port = await listen(server);
  await new Promise((done) => server.close(done));
  return port;
}

function parseMail(xml) {
  const fields = {};
  let field = '';
  const parser = new SaxesParser({ xmlns: true });
  parser.on('opentag', (tag) => {
    if (tag.local.startsWith('i_str')) {
      field = tag.local;
      fields[field] = '';
    }
  });
  const append = (value) => {
    if (field) fields[field] += value;
  };
  parser.on('text', append);
  parser.on('cdata', append);
  parser.on('closetag', (tag) => {
    if (tag.local === field) field = '';
  });
  parser.write(xml).close();
  return fields;
}

export async function stopPostgres(postgres) {
  // The pinned embedded-postgres version retains exited children after a
  // failed start; stop() otherwise waits forever for their already-fired exit.
  const child = postgres.process;
  if (child && (child.exitCode !== null || child.signalCode !== null)) {
    postgres.process = undefined;
  }
  await postgres.stop();
}

// Real app entry point, real PostgreSQL, real browser. Only company boundaries
// (LDAP and SOAP) are substituted; application API responses are never mocked.
export async function startEmailSystem({ users = [] } = {}) {
  const identities = new Map([
    [
      'email.e2e.admin',
      {
        password: 'offline-only',
        profile: {
          name: 'Email E2E Admin',
          email: 'admin@nxp.com',
          employeeId: 'offline-001',
          title: 'Engineer',
        },
      },
    ],
  ]);
  for (const user of users) {
    assert.ok(
      !identities.has(user.username),
      'Opt-in identities cannot replace default admin or duplicate another account',
    );
    identities.set(user.username, user);
  }
  const directory = await mkdtemp(join(tmpdir(), 'psf-email-system-'));
  const mail = [];
  const failOnce = new Set();
  const mailGates = new Map();
  const serviceErrors = [];
  const unexpectedServices = [];
  let postgres, database, backend, browser, frontend, services;
  let backendLogs = '';
  const evidence = process.env.EMAIL_E2E_ARTIFACTS_DIR
    ? resolve(process.env.EMAIL_E2E_ARTIFACTS_DIR)
    : join(directory, 'evidence');
  await mkdir(evidence, { recursive: true });

  async function close() {
    for (const gate of mailGates.values()) gate.release();
    mailGates.clear();
    const errors = [];
    async function cleanup(action) {
      try {
        await action();
      } catch (error) {
        errors.push(error);
      }
    }
    await cleanup(async () => {
      if (browser) await browser.close();
    });
    await cleanup(async () => {
      if (backend && backend.exitCode === null && backend.signalCode === null) {
        const exited = once(backend, 'exit');
        backend.kill('SIGTERM');
        const timer = setTimeout(() => backend.kill('SIGKILL'), 10_000);
        try {
          await exited;
        } finally {
          clearTimeout(timer);
        }
      }
    });
    await cleanup(async () => {
      if (database) await database.end();
    });
    await cleanup(async () => {
      for (const server of [frontend, services]) {
        if (server?.listening) {
          const closed = new Promise((done) => server.close(done));
          server.closeAllConnections();
          await closed;
        }
      }
    });
    await cleanup(async () => {
      if (postgres) await stopPostgres(postgres);
    });
    if (process.env.EMAIL_E2E_ARTIFACTS_DIR) {
      await cleanup(() =>
        writeFile(join(evidence, 'backend.log'), backendLogs),
      );
    }
    await cleanup(() => rm(directory, { recursive: true, force: true }));
    if (errors.length) throw new AggregateError(errors, 'E2E cleanup failed');
  }

  try {
    await readFile(join(frontendDist, 'index.html'));
    await readFile(join(backendRoot, 'dist/main.js'));
    services = createServer(async (req, res) => {
      try {
        let body = '';
        for await (const chunk of req) body += chunk;
        if (req.url === '/ldap' && req.method === 'POST') {
          const credentials = JSON.parse(body);
          const identity = identities.get(credentials.username);
          res.setHeader('Content-Type', 'application/json');
          if (!identity || credentials.password !== identity.password) {
            res.end(JSON.stringify({ status: '401' }));
            return;
          }
          res.end(
            JSON.stringify({
              status: '200',
              data: {
                user: credentials.username,
                ...identity.profile,
              },
            }),
          );
        } else if (req.url === '/soap' && req.method === 'POST') {
          assert.equal(req.headers.soapaction, '"http://tempuri.org/SendMail"');
          const fields = parseMail(body);
          const gateEntry = [...mailGates.entries()].find(([draftNo]) =>
            fields.i_strBody.includes(draftNo),
          );
          if (gateEntry) {
            const [draftNo, gate] = gateEntry;
            gate.enter(fields);
            await gate.released;
            mailGates.delete(draftNo);
          }
          const failedId = [...failOnce].find((id) =>
            fields.i_strBody.includes(id),
          );
          const accepted = !failedId;
          mail.push({ ...fields, accepted });
          res.setHeader('Content-Type', 'text/xml');
          if (failedId) {
            failOnce.delete(failedId);
            // HTTP 200 SOAP faults must still trigger retry.
            res.end(
              soapEnvelope(
                '<soap:Fault><faultcode>soap:Server</faultcode><faultstring>Offline relay unavailable</faultstring></soap:Fault>',
              ),
            );
          } else {
            res.end(
              soapEnvelope('<SendMailResponse xmlns="http://tempuri.org/"/>'),
            );
          }
        } else {
          unexpectedServices.push(`${req.method} ${req.url}`);
          res.writeHead(404);
          res.end();
        }
      } catch (error) {
        serviceErrors.push(String(error));
        res.writeHead(500);
        res.end('Fixture boundary error');
      }
    });
    const servicePort = await listen(services);
    const backendPort = await freePort();
    frontend = createServer(async (req, res) => {
      try {
        const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
        if (pathname.startsWith('/api/')) {
          const upstream = proxyRequest(
            {
              host: '127.0.0.1',
              port: backendPort,
              path: req.url,
              method: req.method,
              headers: { ...req.headers, host: `127.0.0.1:${backendPort}` },
            },
            (response) => {
              res.writeHead(response.statusCode, response.headers);
              response.pipe(res);
            },
          );
          upstream.on('error', (error) => {
            res.writeHead(502);
            res.end(String(error));
          });
          req.pipe(upstream);
          return;
        }
        let filename = resolve(
          frontendDist,
          `.${decodeURIComponent(pathname)}`,
        );
        assert.ok(
          filename === frontendDist || filename.startsWith(frontendDist + sep),
        );
        let content;
        try {
          content = await readFile(filename);
        } catch {
          filename = join(frontendDist, 'index.html');
          content = await readFile(filename);
        }
        const mime = {
          '.html': 'text/html',
          '.js': 'application/javascript',
          '.css': 'text/css',
          '.png': 'image/png',
          '.svg': 'image/svg+xml',
          '.woff2': 'font/woff2',
        };
        res.setHeader(
          'Content-Type',
          mime[extname(filename)] ?? 'application/octet-stream',
        );
        res.end(content);
      } catch (error) {
        res.writeHead(500);
        res.end(String(error));
      }
    });
    const origin = `http://127.0.0.1:${await listen(frontend)}`;
    const databasePort = await freePort();
    postgres = new EmbeddedPostgres({
      databaseDir: join(directory, 'pgdata'),
      user: 'postgres',
      password: 'offline-only',
      port: databasePort,
      persistent: false,
      createPostgresUser: false,
      postgresFlags: ['-h', '127.0.0.1'],
      onLog: () => {},
      onError: (error) => serviceErrors.push(String(error)),
    });
    await postgres.initialise();
    await postgres.start();
    await postgres.createDatabase('notification_test_email_system');
    database = new pg.Pool({
      host: '127.0.0.1',
      port: databasePort,
      user: 'postgres',
      password: 'offline-only',
      database: 'notification_test_email_system',
    });
    // Empty temporary cwd prevents ConfigModule from loading the developer's .env.
    // An explicit environment also prevents inherited DB/LDAP/mail configuration.
    backend = spawn(process.execPath, [join(backendRoot, 'dist/main.js')], {
      cwd: directory,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'test',
        PORT: String(backendPort),
        DB_HOST: '127.0.0.1',
        DB_PORT: String(databasePort),
        DB_USER: 'postgres',
        DB_PASSWORD: 'offline-only',
        DB_NAME: 'notification_test_email_system',
        SESSION_SECRET: 'offline-email-e2e-session-only',
        SESSION_COOKIE_SECURE: 'false',
        FRONTEND_ORIGIN: origin,
        DEV_AUTH_ENABLED: 'false',
        INITIAL_ADMIN_USERNAME: 'email.e2e.admin',
        LDAP_AUTH_URL: `http://127.0.0.1:${servicePort}/ldap`,
        MAIL_ENABLED: 'true',
        MAIL_SOAP_URL: `http://127.0.0.1:${servicePort}/soap`,
        MAIL_SMTP_SERVER: 'offline-relay',
        MAIL_DEFAULT_TO: 'alerts@nxp.com',
        MAIL_REDIRECT_TO: 'capture@nxp.com',
        MAIL_POLL_INTERVAL_MS: '200',
        MAIL_TIMEOUT_MS: '2000',
        APP_BASE_URL: origin,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    backend.on('error', (error) => serviceErrors.push(String(error)));
    backend.stdout.on('data', (data) => {
      backendLogs += data;
    });
    backend.stderr.on('data', (data) => {
      backendLogs += data;
    });
    await expect
      .poll(
        async () => {
          if (backend.exitCode !== null) throw new Error(backendLogs);
          try {
            return (await fetch(`${origin}/api/health`)).status;
          } catch {
            return 0;
          }
        },
        {
          timeout: 30_000,
          message: 'Real backend starts against disposable PostgreSQL',
        },
      )
      .toBe(200);
    browser = await chromium.launch(
      process.env.EMAIL_E2E_CHROME
        ? { executablePath: process.env.EMAIL_E2E_CHROME }
        : {},
    );
    return {
      origin,
      database,
      browser,
      mail,
      failOnce,
      pauseMail(draftNo) {
        let enter, release;
        const entered = new Promise((resolve) => {
          enter = resolve;
        });
        const released = new Promise((resolve) => {
          release = resolve;
        });
        mailGates.set(draftNo, { enter, release, released });
        return { entered, release };
      },
      evidence,
      close,
      assertHealthy() {
        assert.deepEqual(serviceErrors, []);
        assert.deepEqual(unexpectedServices, []);
      },
    };
  } catch (error) {
    if (backendLogs) console.error(backendLogs);
    await close();
    throw error;
  }
}

export async function loginPage(
  system,
  t,
  expectedHttpErrors = [],
  credentials = {
    username: 'email.e2e.admin',
    password: 'offline-only',
  },
) {
  const context = await system.browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  let authenticated = false;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const expectedAnonymousCheck =
      !authenticated &&
      message.location().url === `${system.origin}/api/me` &&
      message.text().includes('401');
    const expectedIndex = expectedHttpErrors.findIndex(
      (error) =>
        message.location().url === `${system.origin}/api${error.path}` &&
        new RegExp(`\\b${error.status}\\b`).test(message.text()),
    );
    if (expectedIndex >= 0) expectedHttpErrors.splice(expectedIndex, 1);
    else if (!expectedAnonymousCheck) errors.push(message.text());
  });
  t.after(() => {
    assert.deepEqual(errors, [], 'Browser has no app runtime errors');
    system.assertHealthy();
  });
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === system.origin) return route.continue();
    if (url.hostname === 'fonts.googleapis.com')
      return route.fulfill({ contentType: 'text/css', body: '' });
    return route.abort();
  });
  await page.goto(`${system.origin}/login`);
  await page.getByLabel('Username', { exact: true }).fill(credentials.username);
  await page.getByLabel('Password', { exact: true }).fill(credentials.password);
  await page
    .getByRole('button', { name: 'Sign in to Portal', exact: true })
    .click();
  await expect(page).toHaveURL(`${system.origin}/dashboard`);
  authenticated = true;
  return page;
}

export async function api(page, method, path, data) {
  const response = await page.request.fetch(
    `${new URL(page.url()).origin}/api${path}`,
    { method, data },
  );
  assert.ok(
    response.ok(),
    `${method} ${path}: ${response.status()} ${await response.text()}`,
  );
  return response.json();
}
