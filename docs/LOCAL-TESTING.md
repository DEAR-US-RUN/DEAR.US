# Reproducing the local tests

These instructions use Bash, Node 24 and disposable services bound to localhost. Every password/key shown below is **fake and for local testing only**. Do not reuse real cloud credentials or point these tests at any real data. Use a clean checkout without a production `.env.local`. The integration tests intentionally **truncate tables**, and the storage cleanup test deletes its own test object versions.

## 1. Install and run unit/sample tests

```bash
nvm use  # or otherwise select Node 24
npm ci
npx playwright install chromium
npm run build
npm test
npm run audit:deps
```

For the sample browser tests, start `npm run dev:api` and `npm run dev` in separate terminals with no Firebase web config; then:

```bash
npm run test:e2e
```

Three sample tests run; emulator/storage tests are skipped. The sample is deliberately read-only.

## 2. Create two disposable local PostgreSQL databases

One possible setup uses Docker; these examples are **not** commands for production:

```bash
docker run -d --rm --name dear-us-postgres-test \
  -p 127.0.0.1:5432:5432 \
  -e POSTGRES_PASSWORD=local-postgres-test-only \
  postgres:17.11

docker exec -i dear-us-postgres-test psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE dear_test_migrator LOGIN CREATEDB CREATEROLE PASSWORD 'local-migrator-test-only';
CREATE DATABASE dear_api_test OWNER dear_test_migrator;
CREATE DATABASE dear_browser_test OWNER dear_test_migrator;
SQL
```

Wait until PostgreSQL is ready before the `docker exec` command. If you already have PostgreSQL running, use it with entirely separate databases and equivalent locally restricted roles instead. Use another host port only if necessary, and change both URLs consistently. If Docker is unavailable, the same steps can be run as a local PostgreSQL administrator with `psql`.

Apply migrations and create/grant the runtime role for **both** databases:

```bash
export RUNTIME_ROLE_NAME=dear_test_runtime
export RUNTIME_ROLE_PASSWORD=local-runtime-test-only
export MIGRATION_DATABASE_URL='postgresql://dear_test_migrator:local-migrator-test-only@127.0.0.1:5432/dear_api_test'
npm run db:migrate
npm run db:roles
export MIGRATION_DATABASE_URL='postgresql://dear_test_migrator:local-migrator-test-only@127.0.0.1:5432/dear_browser_test'
npm run db:migrate
npm run db:roles
unset RUNTIME_ROLE_PASSWORD
```

The script modifies grants in the chosen database; never run it against a database shared with unrelated applications. It requires role-creation privileges and a database owner. The role is cluster-wide while grants are database-specific.

## 3. Destructive local API integration suite

```bash
TEST_DATABASE_URL='postgresql://dear_test_runtime:local-runtime-test-only@127.0.0.1:5432/dear_api_test' \
TEST_MIGRATION_DATABASE_URL='postgresql://dear_test_migrator:local-migrator-test-only@127.0.0.1:5432/dear_api_test' \
ALLOW_DESTRUCTIVE_TEST_DB=1 npm run test:integration
```

The suite refuses to run unless both URLs address the **same local database**, its name includes `test`, and the explicit destructive flag is set. It truncates `users` and related tables plus `rate_limits`. It uses actual PostgreSQL and restricted runtime grants, but uses a test-only token verifier and mocked object storage. A successful run is not a real Google/hosted-storage test. Mocked-auth tests can emit `token_revocation_deferred` warnings when they intentionally exercise account blocking; those warnings are expected for that mock.

## 4. Start the local Firebase Auth emulator

In a new terminal, from the project root:

```bash
npx --yes firebase-tools@15.34.2 emulators:start \
  --config firebase.emulator.json --project demo-dear-us --only auth
```

Keep it running on `127.0.0.1:9099`. The browser tests use a test-only Google-provider helper and unsigned **emulator** tokens; they do not open real Google OAuth. The server only permits this emulator configuration outside production, with a `demo-` project and a localhost emulator host. Never enable it on an Internet-facing or production environment.

## 5. Start local versioned object storage

The full storage journey requires a versioned S3-compatible service on localhost. The development run used a **third-party MinIO community build**, `RELEASE.2025-10-15T17-29-55Z`, on Linux x86-64; it is not part of the repository and is for local testing only. Review its provenance and license before use. The publisher supplies the binary and checksum here: [1](https://newreleases.io/project/github/golithus/minio-builds/release/RELEASE.2025-10-15T17-29-55Z).

Example for Linux x86-64, in a disposable directory outside the repository:

```bash
mkdir -p /tmp/dear-us-minio-test && cd /tmp/dear-us-minio-test
BASE=https://github.com/golithus/minio-builds/releases/download/RELEASE.2025-10-15T17-29-55Z
curl -fLO "$BASE/minio-linux-amd64"
curl -fLO "$BASE/minio-linux-amd64.sha256sum"
sha256sum -c minio-linux-amd64.sha256sum
chmod +x minio-linux-amd64
mkdir -p data
MINIO_ROOT_USER=local-minio-test-access \
MINIO_ROOT_PASSWORD=local-minio-test-secret \
./minio-linux-amd64 server --address 127.0.0.1:9000 --console-address 127.0.0.1:9001 data
```

A matching Docker image is an alternative, but was not the runtime used for the recorded local test. Bind it to localhost and use a disposable volume. The checksum above verifies the downloaded binary against the same publisher, not against an independent trusted signature.

In a separate terminal, back in the project root, create the bucket and enable versioning:

```bash
export STORAGE_ENDPOINT=http://127.0.0.1:9000
export STORAGE_REGION=us-east-1
export STORAGE_BUCKET=dear-us-test
export STORAGE_ACCESS_KEY_ID=local-minio-test-access
export STORAGE_SECRET_ACCESS_KEY=local-minio-test-secret
export STORAGE_FORCE_PATH_STYLE=true
npm run test:storage:setup
```

The setup script only accepts a localhost endpoint and bucket name containing `test`. The tested local MinIO build allowed browser CORS by default; its bucket CORS API returned `NotImplemented`. Other versions/services may require configuring local CORS explicitly. This does not establish that hosted S3 CORS is correct.

## 6. Start the browser-test API and Vite

In another terminal, use the isolated **browser** database and the local emulator. The escrow key below is a newly generated local test key; if you restart with a new one, old test diaries' escrow envelopes cannot be opened. Never do that with real data.

```bash
export NODE_ENV=development API_PORT=8788
export DATABASE_URL='postgresql://dear_test_runtime:local-runtime-test-only@127.0.0.1:5432/dear_browser_test'
export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIREBASE_PROJECT_ID=demo-dear-us
export OWNER_ESCROW_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
export STORAGE_ENDPOINT=http://127.0.0.1:9000 STORAGE_REGION=us-east-1 STORAGE_BUCKET=dear-us-test
export STORAGE_ACCESS_KEY_ID=local-minio-test-access STORAGE_SECRET_ACCESS_KEY=local-minio-test-secret STORAGE_FORCE_PATH_STYLE=true
npm run dev:api
```

In a second terminal, run a separate Vite instance pointing at that API:

```bash
export VITE_DEV_PORT=5174 API_PROXY_TARGET=http://127.0.0.1:8788
export VITE_FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9099
export VITE_FIREBASE_API_KEY=local-test-key VITE_FIREBASE_AUTH_DOMAIN=demo-dear-us.firebaseapp.com
export VITE_FIREBASE_PROJECT_ID=demo-dear-us VITE_FIREBASE_APP_ID=local-test-app
npm run dev
```

These deliberately fake Firebase web settings are solely to enable the SDK against the emulator. Do not use them in a deployment. Vite and the API must both be running before starting the browser tests.

## 7. Run local two-member and storage journeys

In another terminal:

```bash
export E2E_EMULATOR=1 E2E_STORAGE=1 E2E_BASE_URL=http://127.0.0.1:5174
export STORAGE_ENDPOINT=http://127.0.0.1:9000 STORAGE_REGION=us-east-1 STORAGE_BUCKET=dear-us-test
export STORAGE_ACCESS_KEY_ID=local-minio-test-access STORAGE_SECRET_ACCESS_KEY=local-minio-test-secret STORAGE_FORCE_PATH_STYLE=true
npm run test:e2e
```

Three tests run: the two-account draft/publish/pair/vault journey; encrypted media upload/download with replay of a still-valid signed POST and verification that the original published version is returned; and version/delete-marker cleanup for a newly generated local test key. The three sample-only tests are skipped in this mode. To run only the two-member journey without object storage, omit `E2E_STORAGE` and the storage variables; the media tests will be skipped.

When finished, stop the processes, remove the disposable MinIO data directory, and run `docker stop dear-us-postgres-test`. This example container has no persistent volume, so its two test databases are discarded. Do not confuse its data with a backup.

The local browser tests do **not** verify real Google sign-in, actual TOTP enrollment, Firebase production revocation, hosted Neon, a hosted storage provider, Vercel, or a real deployment. Those require separate, credentialed verification using nonproduction accounts.
