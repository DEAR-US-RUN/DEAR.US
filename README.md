# dear, us.

A private-by-default diary for one person or two. This repository contains the React/TypeScript/Vite frontend, an Express API packaged as a Vercel function, PostgreSQL migrations, Firebase Authentication integration, and encrypted private S3-compatible media storage.

> **Status:** the application and integrations are implemented and locally exercised, but **no real Firebase project, Google OAuth flow, Neon project, hosted S3 bucket, or Vercel deployment has been configured or verified**. The included preview is explicitly labeled **sample / read-only** and does not persist diary data; an appearance preference may be stored locally in the browser. This is not a security audit or a claim of production readiness. See [Release status](#release-status-and-known-gaps) before inviting real users.

> **Trust model:** diary content and media are encrypted before storage, but this service deliberately holds an owner escrow key for protected support access. **It is not end-to-end encrypted against the service operator.** The operator or anyone who compromises the application, escrow secret, or build pipeline can potentially decrypt content without using the visible audit workflow. Understand and disclose this to users.

## Contents

- [What is included](#what-is-included)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Deploy step by step](#deploy-step-by-step)
- [Security and privacy](#security-and-privacy)
- [Operations, backup, and deletion](#operations-backup-and-deletion)
- [Testing](#testing)
- [Release status and known gaps](#release-status-and-known-gaps)
- [Project structure](#project-structure)

## What is included

- **Spaces and pairing:** personal diaries or connected diaries with an invitation link; no more than two diary spaces per user and two members per connected diary. Limits and role constraints are checked in the API and PostgreSQL, including serialized concurrent joins. Membership removal/replacement is intentionally not supported in v1.
- **Privacy:** each member sees only their own entries by default. A connected diary's Feelings Vault implements **Option A**: only entries explicitly designated for that vault are revealed, and only after both current members approve. Approval is irrevocable in v1; a recipient can copy revealed material. Target dates are reminders, never access gates and never automatic vault triggers. A duration in a connected diary starts when the second member joins; dates and writing-day streaks use UTC.
- **Drafts and publication:** encrypted debounced autosave, serialized writes, version checks, operation-id replay protection, encrypted local recovery, conflict resolution, unload/navigation safeguards, explicit publication confirmation, stable retry after an ambiguous response, and server/database-enforced immutable published records. The UI marks a draft `Saved` only after the API acknowledges it.
- **Media:** client-encrypted images, video, audio/voice notes and PDF attachments; private, size-restricted presigned uploads; completion checks; version-pinned, authorized downloads; and cleanup of abandoned uploads. Limits: images 10 MiB, videos 40 MiB, audio/PDF 20 MiB, at most eight attachments per entry. The browser must support the relevant media format and microphone permissions.
- **Connection bar:** days connected, an optional reminder, and consecutive UTC days on which either member published. It reveals activity timing to the other member, not entry contents; breaking a streak is explicit and has no access effect.
- **Owner workflows:** allowlisted Firebase UID, fresh Google + TOTP MFA authentication, optional in-app TOTP enrollment, and for each page of published text an additional owner credential, written reason, confirmation, rate limiting, and an audit record before content is returned. Account suspension, support-request status, counts, and recent security/access events are also available to authorized owners. Owner access currently covers published text, not draft plaintext or media playback.
- **Appearance and gentle interactions:** dark mode is the default; choose light or follow the device’s current system theme in the header or Settings. The choice is stored only in that browser when local storage is available and otherwise lasts for the session. The dashboard’s gentle-reminder button cycles through a few built-in thoughts, and the connection card offers a privacy explainer; neither creates or saves diary entries.
- **Other safeguards:** server-side Firebase Admin token verification and revocation checks; restricted database role; origin checks; per-IP/user rate limiting; strict input validation; security headers; an authenticated daily cleanup job; redacted errors; local fonts and licensed font notices.

## Quick start

**Requirements:** Node.js **24.x** (`.nvmrc`), npm, Git, and a modern browser with Web Crypto. Node 24 is selected in `package.json` for Vercel as well. [1](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)

```bash
# From the project directory
nvm use                         # or install/select Node 24 by your preferred manager
npm ci
npm run build
npm test
npm run dev:api                # terminal 1, port 8787
npm run dev                    # terminal 2, port 5173
```

Open `http://localhost:5173`. Without configuration, the interface opens a **read-only sample**. It cannot sign in, create persistent diaries, upload files, or record approvals. The API reports unavailable configuration rather than fabricating a successful result. The Vite development server binds to all interfaces for preview use; run it only on a trusted network or firewall it. Never use it as the production server.

To configure real local accounts, copy `.env.example` to `.env.local` and follow the deployment steps below using **separate development providers and secrets**. On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
npm ci
npm run dev:api   # first terminal
npm run dev       # second terminal
```

Vite reads `.env.local` at startup; the local API and migration scripts also load it on Node 24. Restart after changing values. The `VITE_` values are compiled into browser code and are public; **never put a server secret in a `VITE_` variable**. `.env.local`, private keys, dependencies, logs, and build outputs are ignored by Git.

## Configuration

Start from `.env.example`. Set deployment secrets in the hosting provider's encrypted environment settings, not in Git. Use distinct projects, buckets, databases, escrow keys, owner credentials and cron secrets for development, preview and production.

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MESSAGING_SENDER_ID` | Browser build | Firebase web app settings; the first four are required. These identify a project, not an admin secret. |
| `DATABASE_URL` | Server only | Pooled PostgreSQL URL for the restricted runtime role, TLS enabled. |
| `MIGRATION_DATABASE_URL` | Local/CI migration only | Direct connection for the database/schema owner. Do not add it to the deployed application environment. |
| `RUNTIME_ROLE_NAME`, `RUNTIME_ROLE_PASSWORD` | Local/CI role provisioning only | Input to `npm run db:roles`; never put them in client code or commit them. |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Server only | Firebase Admin service-account credentials. The private key may contain literal `\n` escapes; the API converts them to newlines. |
| `APP_ORIGINS` | Server only | Exact comma-separated browser origins, e.g. `https://diary.example.com`; include `http://localhost:5173` only in the separate development environment. No wildcard. |
| `OWNER_ESCROW_KEY` | Server only | Base64 encoding of exactly 32 random bytes. The same key must remain available for every existing diary's escrow envelope. |
| `OWNER_UIDS` | Server only | Comma-separated Firebase UIDs allowed to request owner functions. This is not a substitute for TOTP. |
| `OWNER_CREDENTIAL_SCRYPT` | Server only | Scrypt verifier generated by `npm run owner:credential` from a separate long owner credential. Never use the diary password. |
| `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_FORCE_PATH_STYLE` | Server only | Private versioned S3-compatible storage. Set path style to `true` only if the provider requires it. Production endpoint must be HTTPS. |
| `CRON_SECRET` | Server only | Long random bearer secret for the scheduled cleanup endpoint. |
| `MONITORING_WEBHOOK_URL` | Server only, optional | HTTPS endpoint receiving a small sanitized operational-failure event; no request body, diary text, SQL, token, user data or stack trace. |

`FIREBASE_AUTH_EMULATOR_HOST` and `VITE_FIREBASE_AUTH_EMULATOR_URL` are **test-only**. Never configure either for deployed environments. Production explicitly rejects the Admin emulator setting, and the frontend emulator branch is not included in production builds.

## Deploy step by step

### 1. Firebase Authentication and Google

1. Create a Firebase project for the intended environment, add a Web app, and copy its web configuration into the `VITE_FIREBASE_*` variables. Enable **Authentication → Sign-in method → Google** and configure its consent/support email as prompted.
2. In **Authentication → Settings → Authorized domains**, add the exact production host and any stable preview/development host. Add `localhost` explicitly for local development when needed. Recent Firebase projects may not include it automatically. [2](https://firebase.google.com/docs/auth/faq-and-troubleshooting)
3. Use a dedicated Firebase Admin service account with only the permissions needed for token verification/revocation and user lookup/update. Obtain its project ID, client email, and private key securely; set the three server-only `FIREBASE_*` variables. Do not upload the service-account JSON to Git or place it in `public/`. The API verifies the Firebase ID token, checks revocation, and only accepts the Google provider.
4. For owner access, enable **TOTP MFA** in Firebase Authentication with Identity Platform and verify the owner's email. This may affect provider billing/plan requirements. Firebase's instructions are here: [1](https://firebase.google.com/docs/auth/web/totp-mfa). After the owner first signs in, look up their **Firebase UID** in the Firebase console and put it in `OWNER_UIDS`. In the app's **Settings → Owner authenticator**, reauthenticate with Google, add the displayed one-time setup key to an authenticator, and enter its code. Then sign out and sign back in with Google plus the TOTP. The owner API requires the verified `totp` factor claim and an authentication time less than five minutes old. Enrollment and actual hosted MFA must be verified with your own project; they were not exercised against Firebase here.
5. Restrict the web API key to the appropriate sites/APIs where compatible with Firebase's guidance. Configure Google OAuth consent, domain ownership, support contacts, security policies and any required verification for your actual app.

### 2. Neon PostgreSQL and restricted role

1. Create a **dedicated** Neon database/branch. Obtain an unpooled/direct TLS URL for the migration owner and set `MIGRATION_DATABASE_URL` locally or in a protected migration CI job. Never use this elevated URL as `DATABASE_URL`.
2. Apply the checked-in migrations. The runner takes an advisory lock, records a checksum and skips already-applied migrations. Once deployed, never edit an applied migration: add a new numbered SQL migration instead.

   ```bash
   npm run db:migrate
   ```

3. Create a fresh restricted SQL login and grant only the app's required permissions. The script needs a migration owner allowed to create roles and grant privileges. It revokes `CREATE` on the dedicated `public` schema from `PUBLIC`, removes previous direct runtime grants, rejects elevated/inherited roles or roles owning app objects, and performs grants transactionally. Set a strong random password **without putting it in shell history**:

   ```bash
   export RUNTIME_ROLE_NAME=dear_runtime
   read -rs -p 'Runtime DB password: ' RUNTIME_ROLE_PASSWORD; echo
   export RUNTIME_ROLE_PASSWORD
   npm run db:roles
   unset RUNTIME_ROLE_PASSWORD
   ```

   PowerShell alternative:

   ```powershell
   $env:RUNTIME_ROLE_NAME = 'dear_runtime'
   $pw = Read-Host 'Runtime DB password' -AsSecureString
   $env:RUNTIME_ROLE_PASSWORD = [System.Net.NetworkCredential]::new('', $pw).Password
   npm run db:roles
   Remove-Item Env:RUNTIME_ROLE_PASSWORD
   Remove-Variable pw
   ```

   **Neon-specific:** do not create the runtime role in the Neon Console/CLI/API and assume it is restricted: those roles inherit `neon_superuser`. Create the login through SQL, as the script attempts, and inspect its privileges. [1](https://neon.com/docs/manage/roles) If your provider denies role creation or schema ownership changes, have its database administrator provision an equivalent dedicated SQL role and run/review the grants in `scripts/create-runtime-role.ts`; do not fall back to a superuser. This setup has been tested on local PostgreSQL, not hosted Neon.
4. Construct the **pooled** Neon URL for that SQL login and set it as server-only `DATABASE_URL`; preserve provider-required TLS parameters. Verify that the runtime login can use the app but cannot alter/drop tables or update/delete/truncate `published_entries`. On each new migration, review and rerun the role grant script if new objects are introduced.

### 3. Private versioned S3-compatible bucket

1. Create a dedicated private bucket; block public access and disable anonymous access. Enable **versioning** and keep it enabled. The API checks versioning before issuing every upload policy. Choose a provider that supports S3 presigned **POST**, version IDs, `HeadObject`, version-specific `GetObject`, listing versions and deleting specific versions. Compatibility with a hosted provider remains unverified.
2. Create a narrowly scoped service identity for this bucket/prefix. At minimum it needs bucket-level `s3:GetBucketVersioning` and `s3:ListBucketVersions`, and object-level `s3:PutObject`, `s3:GetObject`, `s3:GetObjectVersion`, `s3:DeleteObject`, and `s3:DeleteObjectVersion` on `private/*`; provider-specific requirements may differ. `DeleteObject` is included for S3 multi-object deletion permissions. [5](https://docs.aws.amazon.com/boto3/latest/reference/services/s3/bucket/object_versions.html) Never grant public reads. The API and cleanup currently share this identity; use network/secret controls and review the wider compromise risk.
3. Set the storage variables. For example, AWS S3 uses an HTTPS regional endpoint; other services may require `STORAGE_FORCE_PATH_STYLE=true`. Set bucket CORS to the exact app origins, for example:

   ```json
   [
     {
       "AllowedOrigins": ["https://diary.example.com"],
       "AllowedMethods": ["GET", "POST", "HEAD"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag", "x-amz-version-id"],
       "MaxAgeSeconds": 300
     }
   ]
   ```

   Use separate test bucket/origins for localhost and preview. Test the provider's actual CORS, policy fields, size enforcement and version-specific GET in a browser.
4. **Do not indiscriminately expire current or noncurrent object versions.** A published entry is pinned to the exact version that was completed; replaying a still-valid upload can make that published version noncurrent. Blanket lifecycle expiry can destroy permanent attachments. The app's authenticated cleanup removes unreferenced staging keys and their versions; plan capacity and a reviewed orphan/version reconciliation procedure separately.

### 4. Owner and cron secrets

Generate the escrow key once per environment in a trusted terminal:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Save it directly in a secret manager and back it up separately from the database. Do **not** regenerate it on each deploy. Run `npm run owner:credential` in an interactive terminal; enter a separate long random owner credential when prompted, then copy **only the resulting verifier** to `OWNER_CREDENTIAL_SCRYPT`. Store the actual credential separately with access controls; it is not recoverable from the verifier. Generate a separate long random `CRON_SECRET`, for example with `randomBytes(32).toString('base64url')`. Avoid retaining secret output in shell history, logs, screenshots or tickets.

### 5. GitHub and Vercel

The source ZIP and local Git repository contain no provider credentials. The workspace already has an initial local commit (created with the neutral author `Arena Agent <agent@local.invalid>`). The source ZIP intentionally excludes `.git`; if you extracted the ZIP, initialize and make your own first commit before adding a remote:

```bash
git init -b main
git add .
git commit -m "Initial private diary application"
```

Configure your own Git name/email if Git asks. Create a **private** GitHub repository yourself, then from this folder:

```bash
git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_PRIVATE_REPOSITORY.git
git branch -M main
git push -u origin main
```

Use your own remote URL; no remote has been created or pushed by this project. Review `git status`, the files to be pushed, and your organization's secret scanning before pushing. Import that repository into Vercel, select the Vite framework, use Node 24, build command `npm run build`, and output directory `dist`. `vercel.json` provides the function, `/api` rewrites, security headers and daily cron. Set the browser and server variables in Vercel **before building**, separated by Production/Preview environments; do not include the migration owner URL. Redeploy after changing any `VITE_` variable.

Use stable, explicitly authorized hosts for preview. Every browser origin must appear both in `APP_ORIGINS` and Firebase authorized domains and, for media, bucket CORS. A dynamically changing preview hostname will not work until individually allowed; do not weaken the production allowlists to fix previews. Never share production data/secrets with preview deployments.

Set `CRON_SECRET` for production; Vercel should invoke `/api/cron/cleanup` with its bearer authorization. The configured schedule is daily at 03:00 UTC. Verify the deployed provider's schedule, routing and permissions rather than assuming they work. See [1](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

### 6. Verify the actual deployment

Before real use, verify in a nonproduction environment with test data:

- `GET /api/health` returns `{"ok":true}`; unauthenticated `GET /api/me` and `GET /api/cron/cleanup` return 401, not the SPA HTML. Deep links and nested API paths route correctly. The rewrite adapter has a local unit test but has not been exercised on Vercel.
- Real Google popup, new-account sync, repeat sign-in, sign-out, token expiry/revocation and disabled accounts work. Confirm only a valid Google Firebase ID token is accepted.
- Create two accounts and a connected diary, accept exactly one invite, verify personal/private entries and media are inaccessible to the other account, verify both vault approvals and target reminder behavior, and verify caps under concurrent requests.
- Check editing, offline/interrupted saves, conflicting tabs, refresh/recovery, repeated publication and immutable entries. Inspect the database and bucket to confirm content and media are ciphertext and published object versions stay available after a presigned POST is replayed.
- Test real TOTP enrollment and owner sign-in, denied non-owner/no-MFA/old-session/incorrect-credential requests, success/failure audit records, account controls, cron authorization, storage cleanup, redacted monitoring and alerting.
- Run an independent security review, threat model and privacy/legal review before holding real diary content. The included tests are not a penetration test.

## Security and privacy

### Encryption and boundaries

Each diary has a random 256-bit AES-GCM key. The browser derives a key from the diary passphrase using PBKDF2-SHA-256 (600,000 iterations and random salt) and stores only an encrypted key envelope. Entry content—including titles, bodies and attachment names—and media bytes are encrypted using AES-GCM with fresh IVs and context-bound additional authenticated data. Passwords are checked by the UI for a minimum length of 12 characters but are not sent to or stored by the API; use a long, unique passphrase. The server cannot enforce password strength without receiving it. Weak passwords can be guessed offline from the envelope.

At diary creation the raw diary key is sent over TLS to the server **once** to create a second AES-GCM escrow envelope under `OWNER_ESCROW_KEY`. The key exists temporarily in server and browser memory; JavaScript does not guarantee complete memory erasure. The normal database stores envelopes, not a plaintext diary key. A trusted owner access request unwraps the escrow key on the server and returns decrypted published text only after the checks and audit transaction succeed. A separate scrypt-protected owner credential is required for each page. There is no cryptographic separation between a user's private and designated vault entries: their visibility is enforced by the API. A malicious server, operator, compromised build, database/runtime plus escrow secret, XSS, browser extension, stolen unlocked device, or authorized owner can defeat these protections. Audit records deter and document use of the provided workflow; they cannot prevent privileged infrastructure bypass.

Diary titles, relationship labels, members, email/display names, timestamps, declared MIME types, encrypted sizes, vault designation and approvals, and activity counts remain metadata visible to the service. The other diary member also sees shared activity timing. Invitation tokens are random, stored as hashes, expire after 72 hours, and are one-use; the link puts the token in its URL fragment to avoid sending it in the initial web request. Anyone who gets the link can try to join, so share it privately; send the diary passphrase separately through a trusted channel. Creating a new link revokes earlier unused links.

Firebase's browser SDK manages the browser session; API calls use short-lived bearer ID tokens over HTTPS rather than a session cookie. The API checks tokens server-side with revocation enabled. Protect against XSS and untrusted extensions; a bearer token available to malicious script can be stolen. No analytics or notifications include diary contents. The application itself does not log request bodies, tokens, passwords, SQL or contents, but review Vercel, proxies, third-party instrumentation and cloud settings to ensure they do not capture them.

### Draft and media limitations

`Saved` means the API has acknowledged the encrypted version, not merely that local storage accepted a copy. While typing or offline the app also tries to retain an encrypted per-tab local backup; it cannot guarantee storage if browser storage is disabled, cleared or full. It does not retain a file still being uploaded. Conflicts never silently overwrite server drafts; choosing **Use this copy** explicitly replaces the current draft version, never a published entry. Publication requests are bound to a draft ID and version; repeats return the original result and attempts to reuse an ID for another draft fail. Save-operation replay records are retained for 30 days.

An already-open unlocked editor can retain an encrypted local copy while disconnected, but a **full offline refresh cannot authenticate or unlock** without reconnecting. Recoverable local ciphertext may remain in browser storage after sign-out; on shared devices clear site data after completing recovery. Unreferenced uploads older than 24 hours are eligible for cleanup, so a file referenced only by a local-only unsaved draft can be lost. In-progress recording/upload must complete before navigating away.

The server checks declared media type/size, ciphertext length and S3 version, **not actual file content**. Encryption prevents server-side MIME inspection, malware scanning, thumbnailing and image/video optimization. Be cautious opening downloaded files. No thumbnail or media optimization pipeline is implemented; encryption/decryption currently buffers the whole file in the browser, which may be slow on low-memory devices.

## Operations, backup, and deletion

- **Cleanup:** the cron endpoint requires `Authorization: Bearer <CRON_SECRET>`. It processes up to 50 old unreferenced pending/ready uploads per invocation, retries failed `deleting` rows after an hour, removes their object versions/delete markers, prunes rate-limit records older than seven days and draft-operation records older than 30 days. It returns processed/removed/failed counts and emits a sanitized alert on storage failure. Monitor cron execution, timeout and backlog; the provider may skip or retry jobs, and a daily batch of 50 may be insufficient at scale. Audit tables are not automatically pruned.
- **Monitoring:** `MONITORING_WEBHOOK_URL` is optional, HTTPS-only and best effort. It receives only an event name, sanitized error class and timestamp. Configure health, error-rate, storage, database, cleanup-backlog and audit alerts independently. Restrict access to logs and redact provider-side request capture. Never use diary contents as telemetry.
- **Backups:** schedule and test encrypted database backups and version-preserving bucket backups, and store the escrow key and provider recovery credentials separately in a secret manager with access controls and disaster recovery procedures. Back up key history before any change; **changing `OWNER_ESCROW_KEY` without a deliberate envelope-rewrapping migration makes old owner escrow inaccessible**. No automatic escrow-key rotation or passphrase-change workflow is supplied. Losing a diary passphrase prevents normal client unlock; losing both the passphrase and usable escrow material can make contents unrecoverable. Restore drills must verify key-envelope and S3 version consistency.
- **Deletion:** the user-facing action records a request, blocks the app account and attempts Firebase token revocation; **it does not erase data or the Google account**. Owner review/closing a request does not erase anything either. Immutable triggers and versioned objects require a separately authorized, legally reviewed deletion/retention procedure covering shared diaries, all object versions, envelopes, database rows, Firebase data where applicable, backups and audit retention. That privileged erasure workflow is **not implemented**; do not promise automatic or complete deletion. Establish and test it, along with jurisdiction-specific policy, before a real launch.
- **Incident response:** revoke exposed Firebase/DB/storage credentials; rotate the owner credential verifier and cron secret; restrict traffic; preserve minimal forensic audit records; assess possible escrow compromise and notify users as required. An escrow-key compromise requires a separately designed, tested re-encryption/rewrapping process, not simply changing an environment variable.

## Testing

```bash
npm ci
npm run build
npm test
npm run audit:deps
npx playwright install chromium
# Start the unconfigured local API and Vite first, then:
npm run test:e2e
```

The default browser suite tests only the labeled read-only sample; the emulator/storage tests are deliberately skipped unless explicitly enabled. The PostgreSQL integration suite is **destructive** and refuses to run unless both URLs point to the same localhost database whose name contains `test`, with `ALLOW_DESTRUCTIVE_TEST_DB=1`; it truncates tables. It mocks Firebase verification and storage, so it does not prove either provider integration. See [docs/LOCAL-TESTING.md](docs/LOCAL-TESTING.md) for exact isolated PostgreSQL, Firebase Auth emulator and versioned MinIO setup and commands, including the real encrypted upload/replay/download test.

### Results recorded during development (29 October 2026)

| Check | Result and scope |
| --- | --- |
| Node 24 production build and unit tests | Passed; 12 unit tests, including crypto, draft recovery and Vercel path adapter. |
| Fresh local PostgreSQL migrations/role + integration | Migration applied and re-run safely; 14 API tests passed using a real disposable PostgreSQL database and **mocked** Firebase/S3. |
| Sample browser | 3 Playwright tests passed, including a narrow mobile viewport and explicit sample labeling. |
| Local emulator browser/storage | 3 tests passed using Firebase Auth emulator, PostgreSQL and versioned local MinIO: two-member workflow, encrypted upload/download and signed-POST replay, and deletion of test object versions/delete markers. |
| Production dependency audit | `npm audit --omit=dev` reported zero known vulnerabilities at the last run; this is time-dependent and not a security guarantee. |

## Release status and known gaps

**Implemented and locally tested:** the application code, private-by-default authorization, limits, vault consent, immutable/idempotent publishing, draft recovery/concurrency, protected owner workflow, version-pinned encrypted media, local deployment wiring, migrations and test suites described above.

**Credential-blocked / not verified:** real Google OAuth, real Firebase Admin token revocation, real TOTP enrollment and MFA claims, hosted Neon privileges/pooling, hosted object-store IAM/CORS/version semantics, Vercel function routing/security headers/cron, external monitoring, and a full hosted end-to-end journey. No external project, repository or deployment has been created by this build.

**Incomplete or operationally required:** privileged permanent erasure workflow; retention/legal policy; password-change and escrow-key rotation tooling; malware scanning/verified content types; thumbnails/media optimization; robust background reconciliation and cleanup scaling; independent security/accessibility review; production backup/restore drills; provider-specific launch verification. Owner support reads published text only; administrative lists show recent records and are not a full-scale management console. Invite links require an out-of-band message and password exchange; no email delivery is implemented. The local sample is not persistent and is never a substitute for these integrations.

## Project structure

```text
src/                 React app, client auth/crypto, pages and draft state machine
server/              Express auth, authorization, validation, storage and routes
api/index.ts         Vercel function and rewrite path adapter
migrations/          Versioned PostgreSQL schema and immutability/limit triggers
scripts/             Migration, role, owner-credential and test-bucket tools
tests/unit/          Crypto, draft manager and routing tests
tests/integration/   Destructive local PostgreSQL API tests
tests/e2e/           Sample and optional local emulator/storage browser tests
public/              Bundled imagery, fonts and font licenses
vercel.json          Build, routing, headers and cron configuration
```

Generated illustrative images are bundled in `public/images`. DM Sans and Playfair Display font license texts are included in `public/fonts`.
