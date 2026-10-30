# Production sign-in recovery

Google popup completion is separate from application account creation. If
`POST /api/auth/sync` fails, do not bypass authentication or replace server data
with browser-only storage.

## 1. Read the message on the sign-in screen first

After the Google window closes the app calls `POST /api/auth/sync`, then
`GET /api/me`. If either fails, the app stays on the sign-in screen and shows the
server's message. That message identifies the fault:

| Shown on the sign-in screen | Actual cause | Fix |
| --- | --- | --- |
| *"This request is not allowed."* (403 `ORIGIN_DENIED`) | The browser origin is not in `APP_ORIGINS`. Vercel serves several hostnames (project domain, branch/preview domains, custom domain); only the exact one in the address bar is checked. | Put **every** host users visit into `APP_ORIGINS`, exact scheme + host, no path, no trailing slash, comma-separated. Redeploy. |
| *"This page is unavailable / A function needed by this page temporarily failed"* (500 `FUNCTION_INVOCATION_FAILED`) | The serverless function crashed while loading, before any request was handled — a missing module, an incomplete bundle, or an unsupported runtime. Every `/api` call fails, including `/api/health`, so this is not an auth or database problem. | Open `/api/health` in the browser. With the current entry point it returns `{"error":{"code":"API_INIT_FAILED"…}}` and the Vercel log gains an `api_init_failed` line naming the error class. Redeploy with the build cache cleared, and set Node.js to 24.x in Project Settings. |
| *"This service has not been configured yet."* (503 `NOT_CONFIGURED`) | A server variable is missing **in the environment that served this request** (Production vs Preview vs Development), or the Firebase Admin key is unparseable. | Check the Vercel log line `category:FIREBASE_NOT_CONFIGURED`, `FIREBASE_CREDENTIAL_NOT_CONFIGURED`, or `DATABASE_NOT_CONFIGURED`. Add the variable to the right environment and redeploy. |
| *"Account setup is unavailable: the database migration must be applied by the administrator."* (503 `DATABASE_SCHEMA_MISSING`) | The tables were never created in the database the deployment is using. | Run `npm run db:migrate` from a trusted terminal with `MIGRATION_DATABASE_URL` pointing at the **same** database and branch the deployment uses. |
| *"Account setup is unavailable: the administrator must update the database credentials."* (503 `DATABASE_AUTH_FAILED`) | `DATABASE_URL` credentials/host are wrong for that environment. | Replace Production `DATABASE_URL` with a valid pooled runtime connection. |
| *"Account setup is unavailable: the administrator must apply the database runtime-role grants."* (503 `DATABASE_PERMISSION_DENIED`) | The role in `DATABASE_URL` lacks the table grants. | Run `npm run db:roles` with the migration connection plus `RUNTIME_ROLE_NAME` / `RUNTIME_ROLE_PASSWORD`, then point `DATABASE_URL` at that role. |
| *"The database is temporarily unavailable. Please retry later."* / *"…must check the database host."* (503 `DATABASE_UNAVAILABLE`) | DNS/TLS/host error, or the Neon compute is suspended and did not wake within the connect timeout. | Retry once (cold start), then verify the host, database name and TLS. |
| *"Your session expired. Sign in again."* (401 `UNAUTHENTICATED`) | The ID token was rejected: wrong Firebase project for the Admin credentials, the Google provider is disabled, or revocation is on. | Confirm `FIREBASE_PROJECT_ID` matches the project that issued the browser key, and that the service account belongs to the same project. |
| *"Could not reach the service. Check your connection and retry."* | The request never completed (aborted after 20s, offline, or blocked). | Check the network and that Vercel deployment protection is not intercepting `/api/*`. |
| No message at all, it just returns to the sign-in screen | `/api/*` returned HTML (200) instead of JSON — the function is not serving, or a platform page answered. | Open `/api/health` in the browser (step 2). It must print `{"ok":true}`. |

A malformed Firebase Admin private key used to be reported as a 401
*"Your session expired"*. It is now reported as 503 `NOT_CONFIGURED` with the log
category `FIREBASE_CREDENTIAL_NOT_CONFIGURED`.

## 2. Confirm routing and configuration from the outside

Run these against the exact host you visit:

```bash
# 1. Function is deployed and reachable -> must print {"ok":true}
curl -s https://YOUR-DOMAIN/api/health

# 2. Routing + middleware reach the API -> must be 401 UNAUTHENTICATED
curl -s -o /dev/null -w '%{http_code}\n' https://YOUR-DOMAIN/api/me

# 3. Same request with the browser's Origin header -> must still be 401, not 403
curl -s -o /dev/null -w '%{http_code}\n' -H 'Origin: https://YOUR-DOMAIN' https://YOUR-DOMAIN/api/me
```

- (1) printing HTML, or anything other than `{"ok":true}`: the `api/index.ts`
  function is not serving. Check the Vercel build/function logs and that
  Deployment Protection is off for `/api`.
- (2) returning `503 NOT_CONFIGURED`: a server variable is missing in this
  environment (the database URL check runs before authentication).
- (3) returning `403`: `APP_ORIGINS` does not contain that host.

## 3. Then work the deployment checklist

1. Rotate any database, Firebase Admin, and storage credentials previously shared
   in chat. Enter replacements only in the provider's secret settings.
2. Inspect Vercel runtime logs for the failed account-sync request. The server
   reports allowlisted categories without logging SQL, passwords, or tokens:
   - `DATABASE_SCHEMA_MISSING` / `DATABASE_SCHEMA_OUTDATED`: run `npm run db:migrate`
     privately with `MIGRATION_DATABASE_URL` pointing at the same database and
     branch that production uses.
   - `DATABASE_AUTH_FAILED`: update Production `DATABASE_URL` with valid runtime
     credentials.
   - `DATABASE_PERMISSION_DENIED`: review and run `npm run db:roles` privately
     with the migration connection and runtime role settings.
   - `DATABASE_UNAVAILABLE`: check database existence, hostname, TLS and availability.
   - `FIREBASE_NOT_CONFIGURED` / `FIREBASE_CREDENTIAL_NOT_CONFIGURED`: set or
     re-paste `FIREBASE_PRIVATE_KEY`. If the value was copied through an editor
     that doubled the backslashes or turned newlines into spaces, the key will not
     parse. Paste it exactly as it appears in the service-account JSON (either real
     newlines or literal `\n` escapes; both are accepted).
   - `ORIGIN_DENIED`: add the visited host to `APP_ORIGINS`.
3. Production `DATABASE_URL` must be a pooled restricted runtime connection.
   Never deploy `MIGRATION_DATABASE_URL` or use owner credentials as a workaround.
4. Set Firebase Admin credentials from the same project's service-account JSON.
   Enable Google and authorize the live hostname in Firebase Authentication.
5. Set exact `APP_ORIGINS`, including scheme and no trailing slash.
6. Redeploy after setting Production environment variables. Browser `VITE_*`
   configuration requires a rebuild.
7. Verify a real Google account reaches the dashboard, refreshes successfully,
   and can sign out. A successful build or `/api/health` does not verify this.

The Vercel CSP must allow `https://apis.google.com` in `script-src`. Do not add
wildcard scripts or disable token verification, revocation, or rate limiting.
