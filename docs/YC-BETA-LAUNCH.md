# YC application beta launch — Step 5A

Planning deadline: November 2, 2026 (America/Phoenix). This is a preparation audit,
not a deployment or evidence of traction. Work is on main, uncommitted. No hosted
resources, Auth settings, database grants, migrations or actual env files changed.

**Current recommendation: NO-GO for inviting friends until the critical external
checks below pass.** The repository is prepared for a small invited mock-agent
beta; it is not a verified live deployment or a live-LLM release.

## Readiness audit and blockers

| Priority | Finding / resulting behavior | Launch status |
| --- | --- | --- |
| Critical | Render/Vercel origins and resources have not been configured/verified by this step. | Explicit deployment permission and operator setup required. |
| Critical | Actual Render DB role, RLS, sequence access, revision and PostgreSQL locking/finalization are not live-tested here. Previous connection/schema/grant checks are operator-reported. | Verify the intended credential, not a different administrator. |
| Critical | Real email delivery, confirmation, reset and session persistence on the final HTTPS origin have not been tested. | Configure Supabase and test with two independent real accounts. |
| Critical | Existing Supabase project is labeled Production; don't assume its data is disposable. | Confirm beta is allowed there, or use a separately approved beta project/clone. |
| Fixed in source | Anonymous/non-invited access to deployed account data. | Backend requires verified token + UUID invitation for every marketplace route, including listing reads. |
| Fixed in source | Legacy public demo reads, demo overrides and experimental routes. | All deployed backend paths except health, auth/me and account marketplace are 404; the demo frontend is 404 in production; Business is an informational Coming Soon preview. |
| Fixed in source | Hardcoded localhost CORS / silent deployment misconfiguration. | Exact HTTPS origins; production entrypoint validates encrypted PostgreSQL, Auth, beta gate and mock mode before serving. |
| Fixed in source | Unbounded sensitive requests. | In-memory atomic limits and 64 KiB streamed body cap; deployment restricted to one worker/instance. |
| Fixed in source | Two new negotiations confirming the same listing. | Beta final approval locks/archive listing and cancels other unfinished proposals atomically. Test-only SQLite concurrency passes; PostgreSQL must still be checked. |
| Important | Signup is public through Supabase; beta membership controls data, not Auth account creation. | Keep provider abuse/rate controls; don't advertise an unrestricted public launch. |
| Important | Local Ollama is not available on Render. | Hosted provider calls are disabled; deterministic mock is honestly labeled. Live AI requires a separately approved, validated inference service. |
| Important | Runtime role/least privilege, SQL access and Data API/RPC safety. | Direct credentials remain trusted backend secrets; FastAPI ownership is not per-user database RLS. Review before storing sensitive student data. |
| Important | In-memory limiter resets on restart and is not distributed. | Keep one worker/instance; no autoscaling or multi-worker launch. Edge/DDoS protection is not implemented here. |
| Deferrable | Payments, normalized profiles, stock quantities, analytics, B2B, mobile app. | Not needed for this small mock workflow beta; no claims of implementation. |

The existing auth verifier still checks Supabase issuer, audience, signature,
expiry, authenticated role and canonical UUID. Ownership, participant reads,
private projections, version checks and independent approvals remain server-side.
The beta invitation is an additional check, never a substitute for those checks.
No Supabase key becomes user authentication. No frontend identity selector exists
in the real account area.

## Vercel configuration

Use the existing repository, framework Next.js, **Root Directory `frontend`**,
Node.js 22.x, install `npm ci`, build `npm run build`, and default Next.js output
(no static export). `frontend/vercel.json` contains these build defaults and removes
the old hardcoded `/api` rewrite to an unrelated fixed backend URL. Account requests
use the configured HTTPS API origin directly. Never select repository root as the
frontend project. Production and preview env scopes are separate: do not give
arbitrary preview deployments access to the production beta backend.

On Vercel builds (`VERCEL=1`), config validation requires valid HTTPS Supabase and
API origins plus a public publishable key. Local builds still support the existing
unconfigured-demo workflow. NODE_ENV=production hides the demo route and makes
listing browsing token-authenticated. Business is a static Coming Soon preview. Public/static Auth/marketing screens remain
reachable so testers can sign up; private API data is protected on FastAPI.
Review Git auto-deploy settings before any later push: this task did not change
platform settings or approve deployment.

## Render configuration

`render.yaml` is a reviewable blueprint, not an applied resource. Root directory
is the repository root, runtime Python, proposed Python 3.13.18 (match local tested
runtime; confirm Render availability), single Starter instance and one worker.
The proposed paid plan requires operator/billing approval; no resource was created.
Manual auto-deploy trigger is off in the blueprint. Existing service settings are
not changed by saving the file.

```sh
# Build command
python -m pip install -r backend/requirements.txt -c backend/requirements.lock.txt

# Start command
python -m uvicorn backend.production:app --host 0.0.0.0 --port $PORT --workers 1 --no-access-log --no-proxy-headers
```

Health check: **`/health`**, fixed `{"status":"ok"}`; no database query, secret,
version or customer data. It is liveness, not database readiness. No pre-deploy,
startup or build migration command is configured. See the [Render FastAPI guide](https://render.com/docs/deploy-fastapi)
and [blueprint reference](https://render.com/docs/blueprint-spec) for platform settings. Production SQLite fallback is
rejected by startup validation. PostgreSQL schema creation/seeding never occurs
on import. Existing local development SQLite bootstrapping remains intact.

## Exact environment settings by platform

Actual values belong in each platform's environment UI, never this file, a PR,
frontend code, logs or screenshots. This guide includes no complete DB URL.

| Name | Platform | Required setting / visibility |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Vercel | Canonical deployed HTTPS FastAPI **origin**, no path, credentials, query or trailing path. Public. |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel | Same Supabase Auth project as backend; HTTPS origin. Public. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel | Publishable key only; never service-role/secret/JWT-signing keys. Public. |
| `NEXT_PUBLIC_BETA_MODE` | Vercel / local smoke | Optional true for beta; production automatically uses authenticated browsing even if omitted. Not an access-control secret. |
| `NEXT_PUBLIC_FEEDBACK_URL` | Vercel | Optional public HTTPS form; empty hides link. No credentials or private prefilled values. |
| `APP_ENV` | Render | `production`; mandatory for the production entrypoint. |
| `DATABASE_URL` | Render | Private PostgreSQL SQLAlchemy URL with encoded password and SSL. No SQLite default. |
| `DATABASE_POOL_MODE` | Render | `session` for Supavisor Session pooler, `direct` only for an approved reachable direct URL. Transaction pooling disabled for this beta. |
| `CORS_ALLOWED_ORIGINS` | Render | Comma-separated exact HTTPS frontend origins, with no trailing slash/path or wildcard. |
| `BETA_ACCESS_ENABLED` | Render | `true`, mandatory. Backend enforces invitation checks independently of frontend flags. |
| `BETA_ALLOWED_USER_IDS` | Render | Comma-separated canonical verified Supabase user UUIDs; empty denies everyone. Private operator-managed list; up to 100, plan only 5–10. |
| `ENABLE_ACCOUNT_MARKETPLACE` | Render | Default `false` in source/blueprint; explicitly set `true` only after approved launch checks to allow invited testing. |
| `SUPABASE_URL` | Render | Same trusted HTTPS Auth project used by frontend; not a database URL. |
| `SUPABASE_PUBLISHABLE_KEY` | Render | Same project's publishable key; no service-role key is required. |
| `SUPABASE_AUTH_LEGACY_HS256` | Render | `false` unless the actual project uses legacy HS256 and existing supported remote Auth verification is explicitly needed; never enable unverified decoding. |
| `AI_PROVIDER` | Render | `mock`, mandatory; UI marks deterministic mock. |
| `MAX_NEGOTIATION_TURNS` | Render | `8`; backend still caps at 8. |
| `ENABLE_JUDGE_MODE`, `PUBLIC_DEMO_MODE` | Render | `false`; deployed guard blocks demo even if legacy flags are mistakenly true. |
| `PYTHON_VERSION` | Render | `3.13.18` in blueprint; confirm platform supports this patch or approve a tested compatible patch. |
| `PORT` | Render | Platform-assigned, consumed by start command; don't hardcode or publish it. |

Do not put DATABASE_URL, BETA_ALLOWED_USER_IDS, private passwords or secret API keys
in `NEXT_PUBLIC_*`. Vercel's public variables are baked into builds; changing them
requires an approved rebuild/deploy. Render allowlist changes require a service
restart/redeploy; they are not browser-only toggles. Closing an invite does not
remove an Auth account or its records, and logout isn't immediate JWT revocation.

## Supabase Auth configuration (operator actions, not executed)

Review existing Auth consumers first: changing a shared project's Site URL or
email templates can affect other applications. Preserve unrelated required
redirects and obtain approval, or use a separate beta project. Set the approved
Auth Site URL to the final canonical Vercel/custom-domain HTTPS origin. Allow
only the actual callback destinations needed by this application, including
`<frontend-origin>/auth/callback` (including the application's safe query flows),
`<frontend-origin>/auth/confirm` and recovery/reset destinations. Avoid a broad
`*.vercel.app` production allowlist. Keep localhost callbacks only for deliberate
local development. [Supabase redirect guidance](https://supabase.com/docs/guides/auth/redirect-urls)
recommends exact production destinations.

Review the existing token-hash email templates in `docs/AUTH-UI.md`: confirmation
uses the application's `/auth/confirm` with token_hash and type=email; recovery
uses type=recovery and routes to reset-password. PKCE callbacks exchange codes
through `/auth/callback`. No open external return URLs are allowed. Verify cookies
persist after refresh and are Secure on HTTPS. Don't disable email confirmation
to mask deliverability problems.

**Email delivery is a blocker:** validate a real non-team tester address. The
built-in Supabase email service restricts non-team recipients; existing custom
SMTP must be configured/verified for friends, with appropriate provider limits.
No SMTP service was purchased/configured by this task. See [official SMTP guidance](https://supabase.com/docs/guides/auth/auth-smtp).
Keep Auth rate limits and review CAPTCHA/abuse controls before broader sharing.
Never add friends as Supabase organization/database administrators to receive mail.

Application code doesn't log tokens or passwords. Backend access logging is off
in the proposed start command. Verify Vercel/platform log retention and redact
callback query strings in any log drains before live tests; auth codes/token
hashes in incoming links are sensitive even though responses redirect to clean
relative URLs and use no-referrer/no-store. Don't paste those links into feedback.

## CORS and backend access control

Only `CORS_ALLOWED_ORIGINS` receives browser allow-origin headers. Allowed methods
are GET/POST/PUT/DELETE/OPTIONS and allowed headers Authorization/Content-Type.
Preflight is handled before authentication. Browsers send each protected request's
current Supabase user token and omit demo cookies. CORS is not authorization:
curl/non-browser clients still face signature checks and invitation checks.
Forwarded-IP headers are not trusted by the limiter; Render's proxy address may
share one generous ingress bucket. Health/preflight do not consume rate buckets.

All marketplace data, including listing browsing, is invite-only in deployed mode.
Signup/login and `/auth/me` remain available to normal Supabase accounts; `/auth/me`
returns only their own verified UUID/role. Allowlist invalidity fails closed.
Unknown/demo/B2B backend routes and documentation URLs are 404 in deployed mode.
There is no judge endpoint, profile switch, automatic demo seed or demo fallback.

Per-minute limits: 600 ingress requests per direct connection address, 180 total
marketplace requests per verified invited user, 60 mutations per user, 30 advance
calls per user, and 10 listing/negotiation creations per user. Responses return
429/Retry-After and the UI tells users to wait; the auto-runner pauses on errors.
Buckets have bounded storage and thread-safe updates. This is deliberately a
single-worker small-beta control, not distributed rate limiting or DDoS protection.
Bodies are bounded to 64 KiB even without Content-Length. Infrastructure-level
slow-client/connection protection still belongs to the hosting edge.

## PostgreSQL readiness and minimum remaining checks

Read `docs/SUPABASE-POSTGRESQL.md` and `docs/POSTGRESQL-SECURITY-VERIFICATION.md`.
Previous successful Session-pooler connection, baseline migration and public-role
revocations are operator-reported. No remote diagnostic, permission edit, schema
migration, production-row query or hosted integration run occurred in Step 5A.

Before traffic, after explicit approval:

1. Use the **actual Render runtime role** for the existing read-only diagnostic:
   `python -m backend.commands.database_check --connect --security`. Verify SSL,
   schema resolution, revision 0001_records, table/sequence access and RLS/grants.
   Keep anon/authenticated/PUBLIC from direct private record access, including
   column/sequence/default grants. Review any RPC/security-definer exposure.
2. Runtime features need SELECT on records, INSERT on kind/data, UPDATE on data,
   sequence USAGE, schema USAGE, and RLS permitting the required account rows.
   Normal withdrawal/finalization archives records; physical DELETE is not needed
   for runtime. Existing diagnostics' table-wide CRUD metric may require review
   for a deliberately column-granted role; do not grant DELETE/admin rights merely
   to turn a metric green. Step 4D's write-test cleanup has stricter prerequisites.
3. A restricted SQL login receives no Supabase end-user auth.uid() context from
   SQLAlchemy. Review backend-role RLS compatibility; do not grant SUPERUSER or
   BYPASSRLS as a shortcut. The backend needs both parties' internal state to
   negotiate, while public API projections omit private limits. SQL credentials
   themselves are trusted; never give them to student testers or frontend code.
4. Validate PostgreSQL competing approvals, rollback and listing-lock/CAS behavior
   on an explicitly approved disposable clone/staging target. New beta finalization
   locks the listing, archives it, cancels other unfinished negotiations and keeps
   the one confirmed agreement atomically. The Step 4D hosted suite is opt-in and
   not automatically run; add the beta-specific competing-agreement case to the
   approved live validation before friends use confirmed workflows.
5. Confirm backup/restore and explicitly handle pre-existing confirmed listings.
   No historic data is rewritten: beta rejects new negotiations on a listing with
   an existing confirmed agreement. One beta listing is single-use, including
   rentals; create a new listing after return/reavailability. This is intentionally
   smaller than inventory/calendar reservation. No payment or fulfillment guarantee.

Do not auto-run Alembic, stamp SQLite, change passwords/roles, copy databases or
run destructive integration tests on the shared Production project.

## Exact deployment order (requires explicit permission)

1. Review source changes, the privacy/model limitations and proposed paid service.
   Obtain approval to push/deploy and to make any hosted setting changes. Disable
   unwanted Git auto-deploy triggers before connecting/pushing release code.
2. Choose the approved beta database/Auth project and final frontend origin.
   Complete DB/role/security review and backup checks. Do not migrate automatically.
3. Create/configure Render from the reviewed blueprint with runtime secrets,
   exact CORS origins, beta gate enabled, empty allowlist and marketplace flag
   **false**. Verify /health over HTTPS. No tester can read marketplace data.
4. Configure Vercel's frontend root/env and deploy after approval. Confirm marketing,
   signup and account pages work; `/marketplace` returns 404; `/b2b` shows only the Coming Soon preview.
5. Configure approved Supabase Site URL, redirects and existing SMTP. Test two
   internal operator accounts' real signup/confirmation/reset and persistence.
6. Copy those verified UUIDs from Supabase Auth Users into Render's allowlist;
   obtain approval to set ENABLE_ACCOUNT_MARKETPLACE=true and restart/deploy.
7. Run the smoke test below with internal test accounts, including concurrent
   proposals, before inviting anyone. Label every resulting record as internal
   testing; don't include it in YC traction counts.
8. Only when all critical checks pass, invite 5–10 consenting friends gradually.
   Keep one worker/instance, manual release control and a working disable switch.

Emergency close: set ENABLE_ACCOUNT_MARKETPLACE=false or clear BETA_ALLOWED_USER_IDS
and restart the service through an approved platform change. Keep records and
backups; do not roll back schema/drop tables. In-flight operations may finish;
review any active proposals before reopening. No kill-switch change was executed.

## Ten-minute post-deployment smoke test

Use two separate browser profiles and two operator/test accounts, not demo profiles.
Keep credentials, token-bearing links and private limits out of screenshots/logs.

| Time | Check |
| --- | --- |
| 0–1 min | HTTPS frontend and /health; demo/backend B2B/API docs return 404; frontend Business shows Coming Soon; backend called over approved HTTPS origin. |
| 1–2 min | Fresh signup/real email confirmation/login; reload preserves session; reset link reaches the safe reset screen. |
| 2–3 min | Uninvited test account gets waiting-for-invitation; anonymous requests get no marketplace data. |
| 3–4 min | Seller creates a future-dated sale listing without rental days, edits own listing; buyer has no edit controls. |
| 4–6 min | Buyer starts a mock negotiation with overlapping limits and pickup window; automatic turns stop at a proposal. Pause/resume/reload without duplicate committed turns. |
| 6–7 min | Prepare human review; buyer approves only buyer side, seller independently approves. Only then show Confirmed. Listing becomes withdrawn; competing unfinished proposals cancel. |
| 7–8 min | Repeat with incompatible private limits: no artificial agreement or approval control. Check rental duration and return-date form/summary. |
| 8–9 min | Outsider cannot read negotiation or private limits; logout clears account state; cold reload has no stale confidential form. |
| 9–10 min | Submit a minimal feedback form, verify operator receives it; record actual outcomes and bugs; stop if privacy/auth/transaction checks fail. |

The ten-minute plan assumes email delivery and two internal users are prepared;
slow delivery/cold starts mean the smoke test takes longer, not that it passed.

## Inviting 5–10 testers and recording honest evidence

Friends use normal signup/email confirmation first. The organizer verifies the
person's request through the agreed channel, copies the confirmed Auth user UUID
from the dashboard, appends it to BETA_ALLOWED_USER_IDS and approves the restart.
No database login, shared password, admin role or frontend secret is given out.
Remove a UUID and restart to revoke API membership; it does not delete data.
An empty list grants nobody access. UUID allowlisting does not depend on an
unverified frontend email or mutable user metadata.

Optional NEXT_PUBLIC_FEEDBACK_URL adds a Feedback link to account navigation only
when it is a credential-free HTTPS URL. Create a simple external form manually if
approved; don't collect passwords, private budget limits, tokens or full database
URLs. Ask task attempted, success/failure, device/browser, short issue description
and optional follow-up consent. There is no new analytics/feedback database.

Maintain a private sheet with tester alias (not unnecessary personal details),
actual signup confirmation time, listing task, negotiation attempted, both-human
approval outcome, observed bug, feedback reference and follow-up status. Count
unique real testers separately from founders, mocks and automated accounts.
Report actual task completions, not agent ACCEPT as a human-approved deal; report
no payments/revenue or successful fulfillment without evidence. Ask consent for
any quote. Capture real numbers on November 2 rather than pre-filling forecasts.

## Features that remain disabled / intentionally deferred

Hosted Ollama/live LLM inference; B2B; legacy demo/profile/judge endpoints;
payments; public unrestricted marketplace access; automatic migrations/imports;
multi-instance/multi-worker scaling; broad telemetry. The source default account
flag remains false. Local development retains existing demo and Ollama options.
Signup UI is public, but signup alone never grants beta data access.

## Verification and source inventory

Automated checks use temporary SQLite and synthetic Supabase Auth, not the hosted
project. Run normal regressions and the additional invited-beta smoke separately:

```sh
.venv/bin/python -m pytest backend/tests -q
.venv/bin/python frontend/tests/support/run-account-marketplace.py
.venv/bin/python frontend/tests/support/run-account-marketplace.py --beta
npm run typecheck --prefix frontend
npm run build --prefix frontend
git diff --check
```

The normal runner covers signup/login/recovery/persistence, sale/rent forms,
ownership, automatic progression, independent approvals, no-agreement outcomes,
privacy and local demo isolation. The new beta runner covers normal signup with
uninvited denial and two invited sessions with real FastAPI requests, approval,
archival and logout. Production-startup tests mock connections/DDL; actual hosted
connectivity, migrations, concurrency and SMTP are not inferred from their success.

New files:

- `backend/beta.py`, `backend/deployment.py`, `backend/production.py`
- `backend/tests/test_beta.py`
- `frontend/app/marketplace/demo.tsx` (existing demo moved intact behind server gate)
- `frontend/lib/deployment.cjs`, `frontend/lib/feedback.ts`
- `frontend/tests/beta-config.spec.ts`, `frontend/tests/beta-smoke.spec.ts`
- `render.yaml`, `docs/YC-BETA-LAUNCH.md`

Modified files:

- `README.md`, `.env.example`, `frontend/.env.example`
- `backend/main.py`, `backend/routes/marketplace.py`, `backend/services/account_marketplace.py`
- `backend/tests/conftest.py`, `backend/tests/test_account_marketplace.py`,
  `backend/tests/test_auth.py`, `backend/tests/test_database.py`,
  `backend/tests/test_negotiation.py`, `backend/tests/test_security_audit.py`
- `frontend/app/page.tsx`, `frontend/app/b2b/page.tsx`,
  `frontend/app/marketplace/page.tsx`, `frontend/app/marketplace/account/page.tsx`
- `frontend/app/components/account-nav.tsx`, `frontend/app/components/auth-screen.tsx`
- `frontend/lib/api/authenticated.ts`, `frontend/lib/api/marketplace.ts`,
  `frontend/lib/supabase/proxy.ts`, `frontend/next.config.ts`, `frontend/vercel.json`
- `frontend/tests/account-marketplace-api.spec.ts`,
  `frontend/tests/support/run-account-marketplace.py`

No actual env files, SQLite records, existing migrations, hosted resources or
credentials changed. No commit, push or deployment is authorized by this document.

Actual Step 5A local results: **345 backend tests passed**, **79 frontend
regression tests passed**, and **2 invited-beta browser smoke tests passed**.
TypeScript, production build and `git diff --check` passed. A read-only local
production HTTP check returned 200 for /, /signup, /login and /marketplace/account,
and 404 for /marketplace and /b2b. All browser accounts/Auth responses and backend
SQLite stores in automated integration were synthetic/temporary. No actual hosted
PostgreSQL transaction/concurrency test, SMTP delivery or real deployed two-account
smoke test was run. Existing SQLite, actual environment files and all existing
migrations retained identical checksums; no actual credential value was found in
changed source.

### Production homepage regression checks

Run `.venv/bin/python frontend/tests/support/run-production-preview.py` from
the repository root. This builds and typechecks a temporary frontend copy without
local environment files, then tests desktop/mobile marketplace cards, navigation,
the informational Business preview, and the disabled demo page. It uses port 3103,
does not start a backend or connect to a database, and cleans up its server and
temporary build. Business backend routes remain disabled in production.
