# LDAP API Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Remote-test boundary:** Implement the LDAP integration and unit tests with mocked `fetch`. Do not send a live request to the LDAP endpoint; the operator will perform live endpoint verification personally.

**Goal:** Replace local bcrypt password verification with corporate LDAP API authentication while retaining local `app_users` as the sole source of role and Setup File Owner department authorization.

**Architecture:** `AuthService.validateCredentials()` validates submitted credentials with the LDAP endpoint using native Node `fetch`. Only a confirmed LDAP success can upsert non-authoritative identity fields into `app_users`; the local role and department are never changed by LDAP. The existing controller, session, `/api/me`, guards, frontend API contract, and admin role-management flow remain unchanged.

**Tech Stack:** NestJS 11, `@nestjs/config`, Node native `fetch` and `AbortSignal.timeout`, PostgreSQL via `pg`, Jest.

## Global Constraints

- LDAP URL: `LDAP_AUTH_URL`; default timeout: `LDAP_AUTH_TIMEOUT_MS=10000`.
- LDAP request body is JSON: `{ "username": normalizedUsername, "password": password }`; verify this exact request contract in Postman before deployment.
- LDAP success requires **HTTP 2xx**, body `status === "200"`, and non-null valid `data`.
- A body `status === "401"` produces `401 Unauthorized`; all other LDAP HTTP/protocol/JSON/network/DNS/TLS/timeout failures produce `503 Service Unavailable`.
- Normalize all usernames with `trim().toLowerCase()`; reject an LDAP success whose `data.user` does not equal the submitted normalized username.
- LDAP controls only password validation and identity metadata. `app_users.role` and `app_users.setup_owner_department` remain local authorization data and must never be overwritten by LDAP login.
- First successful LDAP login inserts role `requester` and `setup_owner_department = NULL`; later LDAP logins update only `display_name`, `email`, `employee_id`, `title`, and `updated_at`.
- `password_hash` is nullable with no default. New LDAP and bootstrap rows store `NULL`, never an empty string.
- Passwords must never be logged, persisted, returned, or included in application error messages.
- Use the platform CA trust store. Do not add custom TLS-agent code or a CA-bundle setting unless the corporate endpoint actually fails normal certificate validation.
- Do not add an HTTP client dependency. Remove `bcryptjs` because it has no remaining use.
- No frontend, session, guard, or admin-management API changes.

---

## File Structure

- Modify: `backend/src/auth/auth.service.ts` — LDAP request, response validation, local upsert, schema migration, bootstrap admin.
- Modify: `backend/src/auth/auth.service.spec.ts` — focused service tests for LDAP outcomes, DB writes, and bootstrap behavior.
- Modify: `backend/package.json` and `backend/package-lock.json` — remove unused `bcryptjs`.
- Create: `backend/.env.example` — committed LDAP configuration template.
- Create locally only: `backend/.env` — deployment configuration, ignored by Git.
- Create: `docs/superpowers/plans/2026-09-01-ldap-api-login.md` — this implementation plan.

## Pre-deployment Gate

The current application seeds `admin.demo` and other demo users. Removing seed code does **not** remove rows already stored in an existing database. Since `INITIAL_ADMIN_USERNAME` only provisions when `app_users` is empty, choose one safe rollout path before deploying:

1. **New environment:** start with an empty `app_users` table and set `INITIAL_ADMIN_USERNAME` to the real LDAP username of the first administrator.
2. **Existing environment:** before deploying, provision the real LDAP username as an `admin` row using the approved production database procedure, then verify it can authenticate through LDAP. Do not automatically delete or rename existing users in application code.

Run this read-only preflight query before deployment:

```sql
SELECT username, role, setup_owner_department
FROM app_users
ORDER BY username;
```

Expected result before production cutover: either no rows, or at least one `admin` row whose username is a real LDAP username. Demo rows may remain for audit/history but will no longer authenticate.

### Task 1: Add LDAP configuration and remove bcrypt dependency

**Files:**
- Create: `backend/.env.example`
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`

**Interfaces:**
- Consumes: Nest global `ConfigModule.forRoot()` in `backend/src/app.module.ts`.
- Produces: `LDAP_AUTH_URL`, `LDAP_AUTH_TIMEOUT_MS`, and `INITIAL_ADMIN_USERNAME` configuration values consumed by `AuthService`.

- [ ] **Step 1: Create the committed configuration template**

Create `backend/.env.example`:

```dotenv
LDAP_AUTH_URL=https://ldap.example.test/login
LDAP_AUTH_TIMEOUT_MS=10000
INITIAL_ADMIN_USERNAME=
```

- [ ] **Step 2: Create the local deployment configuration without committing it**

Create `backend/.env` from the example, set the actual initial administrator username, and confirm it is ignored:

```bash
cd backend
cp .env.example .env
# Edit .env and set INITIAL_ADMIN_USERNAME to a real LDAP username.
git check-ignore -v .env
```

Expected: Git reports the `.gitignore` rule that ignores `backend/.env`.

- [ ] **Step 3: Remove the unused bcrypt dependency**

Run:

```bash
cd backend
npm uninstall bcryptjs
```

Expected: `bcryptjs` is removed from both `package.json` and `package-lock.json`.

- [ ] **Step 4: Verify no runtime source imports bcrypt**

Run:

```bash
cd backend
rg "bcrypt" src package.json package-lock.json
```

Expected: no matches after Task 2 removes the test import.

- [ ] **Step 5: Commit configuration and dependency removal**

```bash
git add backend/.env.example backend/package.json backend/package-lock.json
git commit -m "chore(auth): add LDAP configuration and remove bcrypt"
```

### Task 2: Write the failing LDAP authentication tests

**Files:**
- Modify: `backend/src/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `AuthService.validateCredentials(username: string, password: string): Promise<AuthenticatedUserProfile>`.
- Produces: test-defined expectations for `fetch`, PostgreSQL upsert SQL, 401/503 distinction, identity binding, and bootstrap behavior.

- [ ] **Step 1: Replace bcrypt imports and create a ConfigService mock**

Replace the imports and setup so `AuthService` receives `ConfigService` and tests can mock the native global fetch:

```ts
import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { AuthService } from './auth.service';

const ldapData = {
  email: 'example.user@example.test',
  name: 'Example User',
  user: 'example.user',
  manager: 'CN=example.manager,...',
  employeeId: '12345678',
  employeeType: 'Employee',
  title: 'Example title',
  company: 'Example Company',
};

let configService: Pick<ConfigService, 'get' | 'getOrThrow'>;
let fetchMock: jest.Mock;

beforeEach(() => {
  configService = {
    get: jest.fn((key: string, fallback?: unknown) =>
      key === 'LDAP_AUTH_TIMEOUT_MS' ? '10000' : fallback,
    ),
    getOrThrow: jest.fn(() => 'https://ldap.example.test/login'),
  };
  fetchMock = jest.fn();
  global.fetch = fetchMock as typeof fetch;
  service = new AuthService(
    { connect, query } as unknown as Pool,
    configService as ConfigService,
  );
});
```

- [ ] **Step 2: Add the success/upsert test**

```ts
it('authenticates a matching LDAP identity and creates a requester with null password_hash', async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({ status: '200', message: null, data: ldapData }),
  });
  query.mockResolvedValueOnce({
    rows: [{
      id: userId,
      username: 'example.user',
      display_name: ldapData.name,
      password_hash: null,
      role: 'requester',
      setup_owner_department: null,
      email: ldapData.email,
      employee_id: ldapData.employeeId,
      title: ldapData.title,
    }],
  });

  await expect(service.validateCredentials(' EXAMPLE.USER ', 'secret')).resolves.toEqual({
    id: userId,
    username: 'example.user',
    displayName: ldapData.name,
    role: 'requester',
    setupOwnerDepartment: null,
  });

  expect(fetchMock).toHaveBeenCalledWith(
    'https://ldap.example.test/login',
    expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'example.user', password: 'secret' }),
    }),
  );
  expect(query).toHaveBeenCalledWith(
    expect.stringContaining('ON CONFLICT (username) DO UPDATE'),
    ['example.user', ldapData.name, ldapData.email, ldapData.employeeId, ldapData.title],
  );
});
```

- [ ] **Step 3: Add authorization-preservation and error-contract tests**

Add focused tests which assert the SQL update clause includes only LDAP metadata, then add these cases:

```ts
it.each([
  [{ ok: true, status: 200, json: jest.fn().mockResolvedValue({ status: '401', message: null, data: null }) }],
  [{ ok: false, status: 401, json: jest.fn().mockResolvedValue({ status: '401', message: null, data: null }) }],
])('maps an LDAP body status 401 to UnauthorizedException', async (response) => {
  fetchMock.mockResolvedValue(response);
  await expect(service.validateCredentials('example.user', 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);
});

it('maps an HTTP failure to ServiceUnavailableException even when its JSON body says success', async () => {
  fetchMock.mockResolvedValue({
    ok: false,
    status: 502,
    json: jest.fn().mockResolvedValue({ status: '200', message: null, data: ldapData }),
  });
  await expect(service.validateCredentials('example.user', 'secret')).rejects.toBeInstanceOf(ServiceUnavailableException);
});

it.each([
  [new TypeError('network failure')],
  [new DOMException('The operation was aborted.', 'AbortError')],
])('maps LDAP transport failures to ServiceUnavailableException', async (error) => {
  fetchMock.mockRejectedValue(error);
  await expect(service.validateCredentials('example.user', 'secret')).rejects.toBeInstanceOf(ServiceUnavailableException);
});
```

Also add explicit tests that empty username/password makes no fetch call; malformed JSON and malformed LDAP success data return `ServiceUnavailableException`; and a response where `data.user !== normalizedUsername` returns `ServiceUnavailableException` with no database query.

- [ ] **Step 4: Add initial-admin tests**

Mock `INITIAL_ADMIN_USERNAME` and DB counts. Assert both cases:

```ts
it('creates the configured initial administrator only when app_users is empty', async () => {
  (configService.get as jest.Mock).mockImplementation((key: string, fallback?: unknown) =>
    key === 'INITIAL_ADMIN_USERNAME' ? ' EXAMPLE.USER ' : fallback,
  );
  query
    .mockResolvedValueOnce({ rows: [{ count: 0 }] })
    .mockResolvedValueOnce({ rows: [] });

  const provisionInitialAdmin = Reflect.get(service, 'provisionInitialAdmin') as () => Promise<void>;
  await provisionInitialAdmin.call(service);

  expect(query).toHaveBeenLastCalledWith(
    expect.stringContaining("VALUES ($1, $1, NULL, 'admin', NULL)"),
    ['example.user'],
  );
});
```

Add a second test where count is `1` and assert there is no insert. Add a whitespace-only username test and assert no query is made.

- [ ] **Step 5: Run the focused test file and verify red**

Run:

```bash
cd backend
npm test -- --runInBand auth.service.spec.ts
```

Expected: FAIL because `AuthService` does not yet accept `ConfigService` or implement LDAP authentication.

- [ ] **Step 6: Commit the failing test specification**

```bash
git add backend/src/auth/auth.service.spec.ts
git commit -m "test(auth): specify LDAP authentication behavior"
```

### Task 3: Implement the minimal LDAP-backed AuthService

**Files:**
- Modify: `backend/src/auth/auth.service.ts`

**Interfaces:**
- Consumes: global `fetch`, `ConfigService`, `DATABASE_POOL`.
- Produces: unchanged public `validateCredentials`, `getProfile`, `listUsers`, and `updateUser` APIs; private `upsertFromLdap` and `provisionInitialAdmin` helpers.

- [ ] **Step 1: Replace local password types and seed definitions**

Delete the `bcryptjs` import, `SeedUser` interface, `SEED_USERS`, `seedUsers()`, and `findUserByUsername()`.

Change the local row type and add LDAP response types near it:

```ts
interface UserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string | null;
  role: UserRole;
  setup_owner_department: 'GNTC' | 'MFG' | null;
  email: string | null;
  employee_id: string | null;
  title: string | null;
}

interface LdapUserData {
  email: string;
  name: string;
  user: string;
  employeeId: string;
  title: string;
}

interface LdapAuthResponse {
  status: string;
  message: string | null;
  data: LdapUserData | null;
}
```

- [ ] **Step 2: Inject configuration and replace startup seeding**

```ts
constructor(
  @Inject(DATABASE_POOL) private readonly pool: Pool,
  private readonly configService: ConfigService,
) {}

async onModuleInit(): Promise<void> {
  await this.ensureUsersTable();
  await this.provisionInitialAdmin();
}
```

- [ ] **Step 3: Replace credential verification with native fetch**

```ts
async validateCredentials(
  username: string,
  password: string,
): Promise<AuthenticatedUserProfile> {
  const normalizedUsername = username.trim().toLowerCase();
  if (!normalizedUsername || !password) {
    throw new UnauthorizedException('Invalid username or password');
  }

  const ldapUrl = this.configService.getOrThrow<string>('LDAP_AUTH_URL');
  const configuredTimeout = Number(
    this.configService.get<string>('LDAP_AUTH_TIMEOUT_MS', '10000'),
  );
  const timeoutMs = Number.isSafeInteger(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : 10000;

  let response: Response;
  let ldapResponse: LdapAuthResponse;
  try {
    response = await fetch(ldapUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: normalizedUsername, password }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    ldapResponse = (await response.json()) as LdapAuthResponse;
  } catch {
    throw new ServiceUnavailableException(
      'Authentication service is temporarily unavailable',
    );
  }

  if (ldapResponse?.status === '401') {
    throw new UnauthorizedException('Invalid username or password');
  }
  if (!response.ok || ldapResponse?.status !== '200' || !this.isValidLdapUser(ldapResponse.data)) {
    throw new ServiceUnavailableException(
      'Authentication service is temporarily unavailable',
    );
  }

  const ldapUsername = ldapResponse.data.user.trim().toLowerCase();
  if (ldapUsername !== normalizedUsername) {
    throw new ServiceUnavailableException(
      'Authentication service is temporarily unavailable',
    );
  }

  return this.upsertFromLdap(ldapUsername, ldapResponse.data);
}
```

Do not log the caught error or request body.

- [ ] **Step 4: Add minimal response validation and local upsert**

```ts
private isValidLdapUser(data: LdapUserData | null): data is LdapUserData {
  return Boolean(
    data &&
      typeof data.user === 'string' && data.user.trim() &&
      typeof data.name === 'string' && data.name.trim() &&
      typeof data.email === 'string' &&
      typeof data.employeeId === 'string' &&
      typeof data.title === 'string',
  );
}

private async upsertFromLdap(
  username: string,
  data: LdapUserData,
): Promise<AuthenticatedUserProfile> {
  const result = await this.pool.query<UserRow>(
    `INSERT INTO app_users (
       username, display_name, password_hash, role, setup_owner_department,
       email, employee_id, title
     )
     VALUES ($1, $2, NULL, 'requester', NULL, $3, $4, $5)
     ON CONFLICT (username) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       email = EXCLUDED.email,
       employee_id = EXCLUDED.employee_id,
       title = EXCLUDED.title,
       updated_at = NOW()
     RETURNING *`,
    [username, data.name, data.email, data.employeeId, data.title],
  );
  return this.toProfile(result.rows[0]);
}
```

The conflict clause must not mention `role` or `setup_owner_department`.

- [ ] **Step 5: Make schema creation and migration consistent**

In the fresh-table definition replace:

```sql
password_hash TEXT NOT NULL,
```

with:

```sql
password_hash TEXT,
email TEXT,
employee_id TEXT,
title TEXT,
```

After the existing `CREATE TABLE IF NOT EXISTS` query, run this rerunnable migration:

```ts
await this.pool.query(`
  ALTER TABLE app_users ALTER COLUMN password_hash DROP NOT NULL;
  ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email TEXT;
  ALTER TABLE app_users ADD COLUMN IF NOT EXISTS employee_id TEXT;
  ALTER TABLE app_users ADD COLUMN IF NOT EXISTS title TEXT;
`);
```

Keep the existing role/department consistency migration unchanged.

- [ ] **Step 6: Add bootstrap-admin provisioning**

```ts
private async provisionInitialAdmin(): Promise<void> {
  const adminUsername = this.configService
    .get<string>('INITIAL_ADMIN_USERNAME', '')
    .trim()
    .toLowerCase();
  if (!adminUsername) {
    return;
  }

  const userCount = await this.pool.query<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM app_users',
  );
  if (userCount.rows[0]?.count !== 0) {
    return;
  }

  await this.pool.query(
    `INSERT INTO app_users (
       username, display_name, password_hash, role, setup_owner_department
     )
     VALUES ($1, $1, NULL, 'admin', NULL)
     ON CONFLICT (username) DO NOTHING`,
    [adminUsername],
  );
}
```

- [ ] **Step 7: Run focused tests and verify green**

Run:

```bash
cd backend
npm test -- --runInBand auth.service.spec.ts auth.controller.spec.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the implementation**

```bash
git add backend/src/auth/auth.service.ts backend/src/auth/auth.service.spec.ts
git commit -m "feat(auth): authenticate logins through LDAP"
```

### Task 4: Build and run regression verification

**Files:**
- Modify: none unless a check exposes a real regression.

**Interfaces:**
- Consumes: completed LDAP implementation and test suite.
- Produces: verified backend build and unchanged API/session behavior.

- [ ] **Step 1: Run the complete backend unit suite**

Run:

```bash
cd backend
npm test -- --runInBand
```

Expected: PASS.

- [ ] **Step 2: Build the backend**

Run:

```bash
cd backend
npm run build
```

Expected: exit code 0.

- [ ] **Step 3: Confirm the intended package and source changes**

Run:

```bash
git diff HEAD~3..HEAD -- backend/package.json backend/package-lock.json backend/.env.example backend/src/auth/auth.service.ts backend/src/auth/auth.service.spec.ts
git status --short
```

Expected: no `bcryptjs` dependency/import, no committed `backend/.env`, no password logging, and no unrelated files staged.

- [ ] **Step 4: Manual production-like verification**

Using a real authorized LDAP account and a safe environment:

1. Login with valid credentials; expect `200` and the existing profile shape.
2. Query `app_users`; expect a requester row with `password_hash IS NULL`, plus `email`, `employee_id`, and `title`.
3. Change that user to `setup_owner` / `GNTC` in the admin UI, then log in again; expect role/department unchanged and LDAP metadata refreshed.
4. Use a wrong password; expect `401`.
5. Point only the safe test environment at an unreachable LDAP URL; expect `503`.
6. Call `/api/me` using the logged-in session; expect the same profile and no password fields.
7. Review application logs; expect no submitted password value.

- [ ] **Step 5: Commit only if verification required a corrective change**

```bash
git add <corrected-files>
git commit -m "fix(auth): correct LDAP integration regression"
```

## Self-Review

- **Spec coverage:** Tasks 1–3 implement LDAP config, native POST authentication, HTTP/body success checks, 401/503 mapping, timeout, standard TLS, nullable password hashes, LDAP metadata storage, local authorization preservation, removed seeds, and empty-table initial admin provisioning. Task 4 verifies unchanged session/frontend contract and password handling.
- **Deliberate exclusions:** No frontend edit, custom HTTP client, TLS agent, password migration, automatic deletion of legacy users, or new LDAP-specific module. These are unnecessary for the stated behavior.
- **Type consistency:** `validateCredentials()` keeps its existing public signature and `AuthenticatedUserProfile` remains unchanged. `upsertFromLdap(username, data)` is private and receives the normalized, verified LDAP username.
