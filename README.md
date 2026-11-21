# UNIMAK Pay · admin dashboard

The web app the University of Makeni finance team uses to watch fee collections, manage the fee
catalog, move money (commission transfers, bank payouts) and reconcile against Monime.

**Frontend only.** The backend (`unimak-pay-backend`) already exists; this app consumes its Admin
API (`/v1/admin/*`) and never reimplements its logic.

- Next.js 16 (App Router, Cache Components), TypeScript strict, Tailwind 4 + shadcn/ui
- TanStack Query, react-hook-form + zod, `@supabase/supabase-js` + `@supabase/ssr`
- `openapi-typescript` + `openapi-fetch`: every API type comes from `openapi.yaml`
- Vitest + Testing Library, Playwright + MSW. pnpm. Deployed on Vercel.

> **Money is real.** Production Monime is live. Never submit payouts, account provisioning or
> transfer retries against the production API while developing. Use a local backend with
> `MONIME_MODE=mock`, or this app's MSW mocks. The proxy enforces this (see [Safety](#safety)).

## Setup

Requires Node 22+ and pnpm 10.

```sh
pnpm install
cp .env.example .env.local      # then fill it in (see below)
pnpm dev:mock                   # fastest start: no backend, no Supabase (see "Mock mode")
```

### Environment variables

| Variable | Where | What |
|---|---|---|
| `UNIMAK_API_URL` | server only | Backend the `/api/unimak` proxy forwards to. Local: `http://localhost:3100`. Production: `https://unimak-pay-backend.vercel.app`. |
| `ALLOW_PROD_WRITES` | server only | `true` lets a non-production deployment send writes to the production backend. Leave unset. |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL (same project as the backend's `SUPABASE_URL`). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Supabase publishable (anon) key. |
| `NEXT_PUBLIC_API_MOCKING` | public | `msw` mocks the admin API and Supabase Auth in the browser. |

No other secrets belong in this app. `UNIMAK_API_URL` must never be `NEXT_PUBLIC_`.

> Don't put the **backend's** `.env` in this folder: Next.js loads any `.env` here into the server
> process. `.env*` files are git-ignored (except `.env.example`).

### Supabase project settings (once)

- **Authentication → Sign In / Providers:** email + password on; **disable sign-ups**. Admins are
  invite-only: a super admin invites them on the Users page (or the backend's `pnpm admin:create`).
  They then get a Supabase account (an invite or password reset email from Supabase) and sign in
  here with the same email. The first sign-in binds the invitation.
- **Authentication → Multi-Factor:** enable **TOTP**. It's mandatory for `SUPER_ADMIN` and `BURSAR`
  (the backend answers `403 MFA_REQUIRED` for an `aal1` token); the app walks them through
  enrolment on first sign-in.
- **URL configuration:** Site URL = the dashboard (`https://unimak-pay-crm.vercel.app`). Add the
  dashboard's URLs (localhost and Vercel, incl. `/auth/reset-password`) to the redirect allow list.
- **Email templates: required for invites and resets.** Point the links at the dashboard's
  token-hash pages, **not** `{{ .ConfirmationURL }}`. That URL is Supabase's own `/verify`, which
  uses up the token on GET, so Outlook / Office 365 link scanners would burn every invite.
  - *Invite user:* `{{ .SiteURL }}/auth/accept-invite?token_hash={{ .TokenHash }}&type=invite`
  - *Reset password:* `{{ .SiteURL }}/auth/reset-password?token_hash={{ .TokenHash }}&type=recovery`

  These pages only render on GET. The token is exchanged when the person presses the button,
  through a server action (`src/auth/email-link-action.ts`) so `@supabase/ssr` sets the session
  cookies. Then they choose a password (12+ characters) and continue into the normal 2FA step and
  `/me`, which binds the invitation.

## Local dev loop

### Against the local backend (recommended for real integration)

In the backend repo (`../unimak`), with `MONIME_MODE=mock` in its `.env`:

```sh
pnpm db:up && pnpm db:deploy && pnpm db:seed
pnpm admin:create --email you@unimak.edu.sl --role SUPER_ADMIN    # bootstrap yourself
pnpm dev                                                            # http://localhost:3100
```

Here, with `UNIMAK_API_URL=http://localhost:3100` and your Supabase project's URL and anon key:

```sh
pnpm dev                        # http://localhost:3000
```

Payments, transfers and payouts stay in the backend's mock Monime. To push one along, the backend
has `POST /dev/monime/simulate-webhook` (see its README). That route is for you, not the
dashboard.

### Mock mode (no backend, no Supabase)

```sh
pnpm dev:mock
```

MSW (`src/mocks/`) serves every admin operation from in-memory fixtures and fakes Supabase Auth.
It enforces auth, 2FA and each operation's `x-permission` the way the backend does, so role
gating is realistic. State resets on reload.

| Persona | Role | 2FA |
|---|---|---|
| `super@unimak.test` | SUPER_ADMIN | enrolled: asks for the code |
| `bursar@unimak.test` | BURSAR | not enrolled: goes through enrolment |
| `finance@unimak.test` | FINANCE_OFFICER | — |
| `hod@unimak.test` | HEAD_OF_DEPARTMENT (COMPUTING) | — |
| `dean@unimak.test` | DEAN (FAC-SCI-TECH: COMPUTING, INFO-TECH, MATHS) | — |
| `auditor@unimak.test` | AUDITOR (every read except `transfers.read`) | — |
| any other email | not an admin → "no access" | — |

Any password works except `wrong`. The TOTP code is `123456`. Only the super admin has `transfers.read`, as
on the backend, so the others show what an admin without commission transfers sees.

**Faculties & departments:** five faculties (Agriculture inactive) and seven departments (Mathematics
inactive). `MASS-COMM` is one the portal "sent" that needs review, so the nav badge shows 1.
`COMPUTING` is used by the head of department and an eligibility rule, so deactivating it gives a 409.

**Students:** a roster of about 70 active students across department × level (Mass Communication
levels 1–2 only) with this year's tuition, the Computer Science levy, matriculation for level 1 and,
from level 2, last year's tuition (due 2026-01-31, so what's left of it is overdue). Three active
students have nothing billed (the "check rate rules" warning), five inactive ones only count with
"Include inactive students", and 15 applicants pay the application fee. `UNI-2025-0100` came from
application `APP-2025-4100` and has portal events, receipts and payments that open in payment detail.

**Email links:** use `token_hash=invite:<email>` or `recovery:<email>`, e.g.
`/auth/accept-invite?token_hash=invite:pending@unimak.test&type=invite`. `token_hash=expired` is
refused like a used link. **Invite outcomes** depend on the email: `+registered` gives
ALREADY_REGISTERED, `+noconfig` NOT_CONFIGURED, `+fail` FAILED (re-send then succeeds), anything
else SENT. Re-sending for `race@unimak.test` hits the 409 "already signed in" case. In mock mode
the link is verified by the browser client, because MSW can't reach a server action. Test hooks: a fee type code ending
in `FAIL` simulates Monime failing to create its account. A payout narration containing
`SIMULATE_503` fails the first attempt with 503.

## Scripts

| | |
|---|---|
| `pnpm dev` / `pnpm dev:mock` | Next dev server (real backend / MSW) |
| `pnpm gen:api` | Regenerate `src/api/schema.gen.ts` + `permissions.gen.ts` from `openapi.yaml` |
| `pnpm typecheck` · `pnpm lint` · `pnpm test` | tsc, ESLint, Vitest |
| `pnpm e2e` | Playwright (starts `next dev` with MSW on port 3217; run `pnpm exec playwright install chromium` once) |
| `pnpm check` | codegen up to date + typecheck + lint + unit tests (CI) |
| `pnpm build` | production build |

## The API contract

`openapi.yaml` is copied from the backend repo and is the source of truth. **When the backend
changes it, copy the new file here and run `pnpm gen:api`.** CI (`pnpm check`) fails if the
generated files are stale.

- `src/api/schema.gen.ts`: types plus enum value arrays (`paymentStatusValues`, …).
- `src/api/permissions.gen.ts`: every admin `operationId` → method, path and `x-permission`. The
  nav, page guards (`RequireOp`) and action buttons (`GatedButton`) read this, so permission
  gating follows the spec. The server still enforces everything.
- `src/api/client.ts`: `openapi-fetch` against `/api/unimak`, adds the Supabase bearer token,
  refreshes once on 401, normalizes both error shapes into `ApiError` (`src/api/errors.ts`).

Never hand-write API types. If the UI needs something the spec doesn't have, it's a backend gap.

## How it fits together

- **Proxy** `src/app/api/unimak/[...path]/route.ts` → `src/server/unimak-proxy.ts`. The backend
  sends no CORS headers, so the browser only talks to this route. It forwards only `/v1/admin/**`
  (no dot segments or encoded slashes), plus the method, query, body and `Authorization`. It drops
  cookies, streams the response back and logs nothing.
- **Auth** `src/auth/auth-provider.tsx`: password sign-in → AAL check → `GET /v1/admin/me`.
  - `MFA_REQUIRED` → TOTP enrolment (QR + secret) or the code step.
  - `FORBIDDEN` → "not an admin" and sign out.
  - 30 minutes idle → sign out, across tabs. Only a timestamp is stored, never a token. Tokens
    live only in supabase-js's own session storage.
- **Money** `src/lib/money.ts`: minor-unit strings and BigInt only, `formatSle`, `parseSleInput`
  (what people type), `sleInWords`.
- **Time** `src/lib/time.ts`: Africa/Freetown (UTC), ISO on hover; calendar days stay strings.
- **Pages** live under `src/app/(app)/…`; each list keeps its filters in the URL.
- **Faculties → departments** `src/components/academics.tsx`: the one place that loads
  `GET /v1/admin/faculties`. Every department field is a dropdown of active, reviewed departments
  grouped by faculty (`DepartmentSelect`, `DepartmentMultiSelect`), and codes are shown by name
  (`DepartmentName`, `useScopeNames`). The Needs review nav badge comes from
  `GET /v1/admin/departments?needsReview=true`.
- **Students** `src/app/(app)/students/…`: the Outstanding heat map (`reports.read`) drills into the
  students list (`payers.read`) through `drill.ts`, which also keeps the two pages' URL filters in
  step. A cell keeps the report's filters and adds its department and level; a count adds `standing`.
  Phones are masked in the list and the CSV (`payments.export` only); the detail page shows the full
  number. The mock mirrors the backend's sums in `src/mocks/analytics.ts`.
- **Commission transfers** need `transfers.read` (super admins unless granted). Without it the
  nav item, the payment's commission transfer, the reconciliation transfer sections and tiles, and
  the report's commission card are hidden. The API sends `null` for them.
- **Public routes:** `/sign-in`, `/sign-in/2fa`, `/no-access`, `/auth/accept-invite`,
  `/auth/forgot-password`, `/auth/reset-password`. They live in the `(auth)` route group; there is
  no middleware. Everything under `(app)` is gated client-side by the session (`AppShell`).

## Safety

- Every money-moving or irreversible action sits behind a confirm dialog that names exactly what
  happens: payout, provision accounts, retry transfer, retry outbox, replay event, deactivate user,
  close fee, delete rules.
- **Payouts:**
  - The review step restates the amount in figures and words and refreshes the balance at Monime.
  - It needs an explicit tick.
  - One idempotency key is minted when the form opens and reused for retries.
  - If an attempt *may* have reached Monime (network error, 5xx, `IDEMPOTENCY_CONFLICT`), the
    form locks: only an unchanged retry with the same key is possible.
- **Proxy guard:** writes (`POST/PUT/PATCH/DELETE`) to `unimak-pay-backend.vercel.app` are refused
  unless `VERCEL_ENV=production` or `ALLOW_PROD_WRITES=true`. Local dev and Vercel previews can
  read production but cannot move its money.

## Deploying (Vercel)

1. Import the repo as a Next.js project (pnpm detected from `packageManager`).
2. Set the env vars.
   - **Production:** `UNIMAK_API_URL=https://unimak-pay-backend.vercel.app`, plus the Supabase URL
     and anon key.
   - **Preview:** point `UNIMAK_API_URL` at a staging/mock backend if you have one. If it points
     at production, writes are blocked by the proxy guard.
3. Add the production and preview domains to Supabase's redirect allow list.
4. Deploy. `pnpm check` should pass in CI first.

## Backend gaps

Things the UI would use that the API doesn't offer (or doesn't type) yet:

1. **CORS:** none, by design. The dashboard must keep using the proxy. Calling the API from the
   browser directly would need CORS on the backend.
2. **Server-side sort on other tables:** only payments, payouts and transfers sort on the server.
   Elsewhere a header click sorts the rows already loaded (the table says so).
3. **`GET /v1/admin/reports/summary` has no `required` properties** in `openapi.yaml`, so every
   field is optional in the generated types. The overview normalizes it in one place; marking the
   properties required would remove that.
4. **`AdminPrincipal` (`/me`) has no `name`.** The header shows the email.
5. **openapi-typescript emits `payerKindValues` twice** (inline `Payer.kind` and the `PayerKind`
   schema). `scripts/gen-api.mjs` renames the inline one. Renaming either enum in the spec would
   avoid it.
