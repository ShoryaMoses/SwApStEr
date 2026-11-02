# YC invite-only beta security review — November 2, 2026

## Decision and evidence boundary

GO for internal website/login/session/API-identity testing with the marketplace
disabled. NO-GO yet for enabling shared-production marketplace transactions or
inviting external testers: the actual Render database role and PostgreSQL
finalization behavior have not been verified in this review.

The operator reports deployed Vercel, Render, Supabase Auth, connectivity,
0001_records, and the expected records columns working. The operator confirmed
that the supplied security diagnostic ran on a **local machine**, not Render.
Consequently its owner/bypass flags do not establish Render's runtime identity.
No hosted endpoint, database, deployment configuration, or customer record was
accessed or modified by this review.

## Application findings

- backend.production validates production configuration before importing the app.
  PostgreSQL startup does not create tables, migrate, seed, or copy SQLite data.
- Auth accepts only verified user Bearer tokens. ES256/RS256 use the configured
  project's JWKS, with issuer, audience, time, role, UUID, and anonymous-user
  checks. Optional HS256 uses the trusted Supabase user endpoint before inspecting
  claims and cross-checks the returned identity. Publishable keys are not users.
- Every marketplace route has feature and invitation dependencies, including
  listing browsing. Disabled routes return 404. Enabled routes require a valid
  token and an allowlisted UUID in production. Invalid allowlists fail closed.
- Owners are assigned from verified identities. Extra identity/state fields are
  rejected. Listing management checks seller identity. Negotiation reads and
  mutations check participants; unrelated users receive 404.
- Public listing projections exclude the seller minimum; owner management
  includes only that owner's minimum. Negotiation projections exclude buyer
  preferences, private limits, and internal audit state. Public offers necessarily
  reveal negotiated prices and can allow inference about willingness to trade;
  this is not cryptographic secrecy of a bargaining strategy.
- Agent progression cannot record human approvals or finalize agreements.
  Explicit human decisions apply only to the verified actor. Version checks,
  READ COMMITTED PostgreSQL semantics, listing-first locks, and atomic updates
  protect competing approvals. Beta finalization archives the listing and cancels
  competing unfinished negotiations in the same transaction.
- Frontend requests use the current session token over HTTPS, omit demo cookies,
  reject redirects, and do not use a supplied UUID as authorization.
- Demo/B2B backend routes remain blocked in production. Business is an
  informational preview. Mock agents remain mandatory; no payment is executed.

A small fix adds private/no-store caching headers to invalid-allowlist 503 errors.
The response already denied access; no authorization bypass was found.

## Database findings and risk assessment

The reported owner has expected owner-level capabilities on its table. The
diagnostic's bypass_rls value combines rolsuper OR rolbypassrls; it is not evidence
that this role is specifically a PostgreSQL superuser. Owners normally bypass
RLS; BYPASSRLS roles bypass even forced RLS. With zero policies, ordinary
non-owner/non-bypass roles are denied row access. Simply switching to a restricted
role and granting CRUD is therefore not a working replacement.

The current application uses one SQLAlchemy credential, not a per-request database
identity. It does not propagate JWT identity into auth.uid(). FastAPI authorization
is the user boundary; RLS does not independently protect users from this backend.
The reviewed paths enforce that boundary, but a leaked database credential,
backend compromise, or future authorization defect has broad impact. Private
limits are stored in JSON, not separately encrypted from database administrators.

Using an owner/bypass credential is not itself proof of an Internet-accessible
data leak. It is excessive runtime privilege. A temporary exception could be
considered only for two consenting internal operators using synthetic data after
Render-role, database-exposure, and transaction checks. Do not accept that
exception for ordinary customer data or a wider launch.

Recommended subsequent design: a separate non-owner runtime login with schema
USAGE, records SELECT, INSERT on kind/data, UPDATE on data, and sequence USAGE;
role-specific RLS permitting the required account record kinds; separate migration
credentials. Normal withdrawal is soft deletion, so runtime DELETE, TRUNCATE,
TRIGGER, REFERENCES, schema CREATE, SUPERUSER, and BYPASSRLS are unnecessary.
This remains backend-trusted authorization, not end-user RLS. Test this design
separately before changing the shared project. Existing diagnostic CRUD metrics
and integration cleanup require broader permissions and should not drive grants.

REFERENCES/TRIGGER do not by themselves grant REST reads of records. They are
unnecessary privileges usable through SQL/function paths and should be removed
from API roles after administrator review. Check effective column and inherited
grants, PUBLIC, sequence access, schema CREATE, exposed views and callable
security-definer functions. The current catalog diagnostic does not audit all
functions/views or prove REST isolation.

Future default grants warrant remediation before creating any new objects. Scope
changes to actual object-creating roles, both global and public-schema defaults;
schema-level revokes alone cannot cancel global grants. Inspect event triggers
and Supabase automatic exposure behavior. Do not change Auth/Storage internals
or blindly revoke privileges across all schemas. Existing objects need separate
review; default changes are not retroactive.

Sources:
- https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- https://supabase.com/docs/guides/api/securing-your-api

## Operator actions, in order (not executed)

1. In the deployed Render service Shell, using its existing environment, run:
   `python -m backend.commands.database_check --connect --security`.
   Do not paste DATABASE_URL, passwords, or raw driver errors. Compare the runtime
   role privately with the intended login. This command reports effective role
   properties without printing its name or credentials. Require connection ok,
   baseline 0001_records, expected columns, resolves_public true, and the intended
   runtime privileges. Investigate review_required rather than treating grants as
   proof of row isolation.
2. In Supabase, have an administrator review the exact runtime role, memberships,
   table/column/sequence grants, policies, exposed views/RPCs and default ACLs.
   Confirm backups and whether this shared Production project is appropriate.
   Review removal of unnecessary API-role REFERENCES/TRIGGER and future grants;
   apply nothing without separate approval. Preserve RLS and existing records.
   A disposable staging database is safer for concurrency testing.
3. On an explicitly authorized isolated PostgreSQL target, validate locking,
   rollback and competing human approvals. Existing backend/integration_tests
   checks CRUD, CAS and row locks; it does NOT test the complete beta finalization
   workflow. Do not claim its passing would prove that entire workflow.
   Do not run it against the shared production database: it commits synthetic
   rows, consumes sequence values, and performs scoped cleanup deletes.
4. In Render, verify APP_ENV=production, AI_PROVIDER=mock,
   BETA_ACCESS_ENABLED=true, ENABLE_ACCOUNT_MARKETPLACE=false,
   DATABASE_POOL_MODE=session (if using the session pooler), encrypted
   DATABASE_URL, exact CORS_ALLOWED_ORIGINS, and only the two verified UUIDs in
   BETA_ALLOWED_USER_IDS. Keep one instance/worker and the reviewed
   backend.production:app start command. Do not change settings in this review.
5. In Vercel, verify the production deployment contains the reviewed source and
   the public API/Supabase origins match Render/Supabase. No database/admin secrets
   in NEXT_PUBLIC variables. Confirm HTTPS, login persistence, logout, safe missing
   marketplace messaging, and the Business Coming Soon page. Production build
   success locally does not establish which revision is currently deployed.
6. In Supabase Auth, verify exact production redirect URLs, real confirmation and
   password recovery delivery, and appropriate signup abuse controls. Account
   creation alone must not grant beta membership. Check platform logs do not
   retain auth callback tokens in shared log drains.
7. Only after these checks and explicit operator approval, enable the marketplace
   for the two internal UUIDs and perform the smoke test below. The necessary
   setting is ENABLE_ACCOUNT_MARKETPLACE=true; leave all other security gates on.
   This step writes intentional test records and needs separate authorization.
   Before friends join, complete real PostgreSQL concurrency and exposure checks.

## Two-account smoke test, after separate write approval

- Use separate browser profiles for one seller and one buyer; both must be invited.
  Confirm anonymous requests fail and an uninvited account receives 403.
- Seller creates a clearly marked synthetic sale listing with future pickup dates;
  buyer cannot manage/edit/withdraw it or retrieve its private minimum.
- Buyer starts a mock negotiation; inspect only these synthetic records.
  Neither participant response reveals the other's limits. A third user cannot
  retrieve or mutate the negotiation.
- Automatic turns stop for human review. Approve as buyer, reload: still pending.
  Seller independently approves: exactly one confirmation, archived listing.
  Replays/stale versions must fail without another finalization.
- Test incompatible limits and rejection/cancellation separately. Keep private
  inputs out of screenshots and reports; report mock behavior honestly.
- Logout clears confidential UI state. Stop on any authorization/privacy failure.
  Emergency operator action: disable the feature or clear the invite list and
  restart; in-flight operations may finish. Preserve records and backups.

In-memory rate limits reset on restart and are not distributed. JWT logout does
not necessarily revoke an already issued token immediately; removing the beta
UUID and restarting revokes marketplace membership. Health is liveness only.

## Actual verification results

- `.venv/bin/python -m pytest backend/tests -q`: **349 passed** after the fix.
- `.venv/bin/python frontend/tests/support/run-account-marketplace.py`:
  **79 passed**, using synthetic Auth and temporary SQLite.
- The same runner with `--beta`: **2 passed**, including uninvited denial and
  two invited participants independently approving.
- `.venv/bin/python frontend/tests/support/run-production-preview.py`:
  production build **passed**, `tsc --noEmit` **passed**, **3 browser tests passed**.
  The runner builds a temporary copy without local .env files; no hosted secrets
  or backend connection are involved.
- `git diff --check`: **passed**.
- Four new parameterized tests exercise all 13 marketplace routes for feature
  disabled, missing user credentials, valid but uninvited users, and malformed
  allowlist configuration, asserting denial before storage access.
- The initial new-test run found the missing no-store header for invalid allowlist
  responses; the final full backend suite passed after correction.
- No live PostgreSQL integration/concurrency tests, hosted security diagnostics,
  hosted login tests, or production smoke writes were performed in this review.
  PostgreSQL compilation/catalog mocks and SQLite concurrency tests are not
  substitutes for real PostgreSQL transaction verification.

Changed files: backend/beta.py, backend/tests/test_account_marketplace.py,
docs/YC-BETA-SECURITY-REVIEW.md, and a review link in docs/YC-BETA-LAUNCH.md.
No commits, pushes, deployments, migrations, or hosted configuration changes.
