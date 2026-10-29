# Production sign-in recovery

Google popup completion is separate from application account creation. If
`POST /api/auth/sync` fails, do not bypass authentication or replace server data
with browser-only storage.

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
