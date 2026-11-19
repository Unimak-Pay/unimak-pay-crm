# Prompt: UNIMAK Pay — admin financial dashboard

> Paste everything below the line into Claude Code, in a new, empty repo.
> Copy `openapi.yaml` from the backend repo into the new repo's root first.

---

Build the **UNIMAK Pay admin dashboard**: the web app the University of Makeni (UNIMAK) finance team uses to watch fee collections, manage the fee catalog, move money (commission transfers, bank payouts) and reconcile against Monime. The backend already exists and is deployed. This repo is **frontend only**. Do not change or reimplement backend logic.

## The backend (already built — consume it, don't change it)

- Base URL: `https://unimak-pay-backend.vercel.app` (env `UNIMAK_API_URL`); locally `http://localhost:3100`.
- **Contract:** `openapi.yaml` in this repo root (OpenAPI 3.1) is the source of truth for every route, request schema, response shape and the permission each operation needs (`x-permission`). Generate TypeScript types from it with `openapi-typescript`. Don't hand-write API types. If the spec and reality disagree, stop and tell me; don't guess.
- Only consume the **Admin API** (`/v1/admin/*`). The channel API, USSD exchange, webhook, cron and dev routes are not for the dashboard.
- **Auth.** Admins sign in with **Supabase Auth**, which this app talks to directly. The backend only verifies the resulting access token: `Authorization: Bearer <supabase access_token>`.
  - Sign-in methods: email + password, plus OAuth providers if enabled. There is no sign-up screen: admins are invite-only (created by a super admin through `POST /v1/admin/users`).
  - **2FA (TOTP) is mandatory for `SUPER_ADMIN` and `BURSAR`.** For these roles the backend rejects tokens that aren't `aal2`, with `403 MFA_REQUIRED`.
    - Flow with `@supabase/supabase-js`: `auth.signInWithPassword` → `auth.mfa.listFactors()`.
    - First time: `auth.mfa.enroll({ factorType: 'totp' })`, show the QR code and the secret, then `challengeAndVerify`.
    - Every later sign-in: `challengeAndVerify` with the 6-digit code.
    - Use `auth.mfa.getAuthenticatorAssuranceLevel()` to route the user to the code step.
  - After sign-in call `GET /v1/admin/me`. It returns `{ id, email, name, role, departments, permissions }`, and the first call also binds the invitation.
    - `403 FORBIDDEN` "Not an active UNIMAK admin": show "Your account is not an admin. Ask a super admin to invite you." and sign out.
  - Token refresh: let supabase-js handle it. Retry a request once after a 401 with a refreshed session.
- **CORS: the backend sends no CORS headers.** The browser must **not** call the backend directly. Add a server-side proxy route, e.g. Next.js `app/api/unimak/[...path]/route.ts`:
  - forward the method, query, JSON body and the user's `Authorization` header to `UNIMAK_API_URL`, and stream the response back;
  - allow only paths under `/v1/admin/`.
  - All client code calls `/api/unimak/v1/admin/...`.
- **Money:** amounts are **strings of SLE minor units** (1 SLE = 100), e.g. `"150000"` = SLE 1,500.00.
  - Never use JS floats for money. Use `BigInt` or string math for arithmetic, and one shared `formatSle(minor: string)` → `"SLE 1,500.00"`.
  - Money inputs: the user types major units (`1500` or `1,500.50`). Convert to a minor-unit string with string math and validate it as an integer > 0.
- **Pagination and sorting:** cursor-based. Pass `?limit=` (≤ 200, default 50) and `&cursor=<nextCursor>`. Responses are `{ items, nextCursor }`, newest first by default. Build one reusable table with "Load more" or infinite scroll.
  - Payments, payouts and transfers take `sort` = `createdAt | -createdAt | amount | -amount`. Column sorting on those tables must set `sort` and restart from the first page.
  - Other tables sort only the rows already loaded; say so in the column header tooltip.
  - Status filters accept only the enum values in the spec.
- **Errors:** two shapes; handle both in one place.
  - Business errors: `{ error: { code, message, details } }`. Show `message`. Some codes are worth explaining in the UI:
    - `AMBIGUOUS_RATE_RULE`: the message names the tie-breaker rule to add first.
    - `MFA_REQUIRED`: go to the 2FA step.
    - `UPSTREAM_UNAVAILABLE`: "Monime is unavailable, try again".
  - Validation errors: `{ statusCode, message: string | string[], error }`.
- **Permissions:** gate every page, button and action on `me.permissions`, using the `x-permission` of the operation it calls. Hide navigation the user can't use, and disable actions with a tooltip saying which permission is missing. The server enforces permissions anyway; the UI just shouldn't offer what will fail.
  - `HEAD_OF_DEPARTMENT` sees only their departments' payments (the server filters them). Show their departments in the header.

| Role | Gets |
|---|---|
| SUPER_ADMIN | everything, incl. users, payouts, account provisioning (2FA) |
| BURSAR | fee setup, instalments, payments + reconcile, reconciliation, transfer/outbox retries; read accounts/payouts (2FA) |
| FINANCE_OFFICER | read payments, accounts, payouts, transfers, reconciliation |
| HEAD_OF_DEPARTMENT | read fees and their departments' payments |
| AUDITOR | every `*.read`, incl. the audit log |

## Domain you need to know

- **Fee types** (APP application, MATRIC, TUITION, DEPT, GRAD, or custom) each have their **own Monime financial account** (`unimak-fee-<code>`). One more `unimak-platform` account receives the platform commission.
- A **fee** is a fee type for a period (`2026/27` or an intake like `2026-SEP`), with lifecycle DRAFT → ACTIVE → CLOSED (CLOSED → ACTIVE is allowed).
  - **Rate rules** set the price by matchers (programCode, department, level, residency, intake; omitted = any). The most specific rule wins, and ambiguous ties are refused.
  - **Eligibility rules:** none = everyone of the payer kind; otherwise the payer must match one.
  - **Instalment rules:** minimum instalment per program; otherwise the fee default.
- **Payments** come from two channels: USSD (Monime USSD flow) and DOTS (Dash Dots app). Statuses: INITIATED, PENDING, COMPLETED, FAILED, EXPIRED.
  - An open payment past `expiresAt` is expired automatically. A late Monime completion is still applied ("late settlement"), so EXPIRED is not final for money.
  - Each payment has an 8-digit **paymentRef** (what payers quote), Monime's **orderNumber** (in Monime's SMS), a Monime payment id `spm-…`, a receipt number `UNIMAK-YYYY-NNNNNN`, and the split `monimeFee` / `platformFee` / `netAmount`.
  - `payerPhone` may be masked (`+23276****56`) because Monime masks numbers. Show it as is.
- **Commission transfer:** after a payment completes, the platform fee moves from the fee account to the platform account (an internal transfer; it can fail and be retried).
- **Payouts:** withdrawals from a fee account to a bank account. Real money.
- **Reconciliation:** a nightly run compares our records with Monime. It auto-settles missed webhooks and raises items for anything else (unmatched or missing payments, fee mismatches, commission problems). Unmatched webhook events can be resolved or replayed.

## Pages and the APIs they use

1. **Sign in / 2FA / no-access** pages; **profile** page (role, permissions, departments; enrolled authenticator).

2. **Overview**:
   - needs-attention counts from `GET /v1/admin/reconciliation` (`counts`: openItems, webhookEvents, failedTransfers, stuckTransfers, stuckPayouts, failedPayouts, deadOutbox, staleOpenPayments, plus `lastRun`), each linking to its list;
   - account balances from `GET /v1/admin/financial-accounts`;
   - the latest payments from `GET /v1/admin/payments?limit=10`.
   - **Collections** from `GET /v1/admin/reports/summary?from=&to=&feeType=&channel=` (`reports.read`), with a date-range picker (default last 30 days, at most 366) and fee type / channel filters kept in the URL. It shows:
     - KPI cards from `collected` (amount, count, average, net after fees, platform commission, late settlements);
     - a daily collections chart from `byDay`, which is already zero-filled;
     - breakdowns from `byFeeType` and `byChannel`;
     - the payment funnel from `payments` (started → completed / pending / failed / expired, `completionRate`);
     - commission (`commission`) and payouts (`payouts`), each shown only when not `null`.
   - Never compute totals by paging through payments.

3. **Payments**:
   - list (`GET /v1/admin/payments`) with filters status, channel, feeType, payerRef, from/to, and a search box bound to `ref`. The search takes a paymentRef, a Monime order number or an `spm-…` id, whatever a payer or Monime support quotes;
   - detail (`GET /v1/admin/payments/{id}`): payer, fee, amounts and split, status timeline (created, expires, completed), Monime ids, receipt number, ledger entry, commission transfer;
   - **Export CSV** (`GET /v1/admin/payments/export.csv` with the current filters, `payments.export`). Download it via the proxy (the response is a file, not JSON). A 400 says to narrow the filters (the limit is 50,000 rows).
   - action **"Check with Monime"** (`POST /v1/admin/payments/{id}/reconcile`, `payments.reconcile`) for open payments; it shows before → after.

4. **Fee setup** (`fees.read` / `fees.manage` / `instalments.manage`):
   - **Fee types** (`GET/POST /v1/admin/fee-types`, `PATCH /{id}`):
     - Creating one also creates its Monime account. If the response has `accountError`, show it with a **"Create account"** retry button (`POST /v1/admin/fee-types/{id}/account`).
     - Show each type's account reference, Monime id and UVAN.
   - **Fees**:
     - list (`GET /v1/admin/fees?feeType=&status=`), create (`POST`, starts as DRAFT);
     - detail (`GET /v1/admin/fees/{id}`) with tabs for rate rules, eligibility and instalments;
     - edit and status changes (`PATCH`); show the server's reason when activation is refused (it needs a rate rule and an account).
   - **Rate rules:** a table editor (`POST`, `PUT /{ruleId}`, `DELETE`). Show `AMBIGUOUS_RATE_RULE` messages inline next to the rule.
   - **Eligibility rules** (`POST` / `DELETE`). **Minimum instalment per program** (`PUT` / `DELETE /instalment-rules/{programCode}`; needs `instalments.manage`).
   - **Preview:** "What would this payer owe?" (`GET /v1/admin/fees/{id}/preview?kind=student|applicant&ref=`) shows eligible, amount, minInstalment and reason.

5. **Treasury**:
   - **Accounts:** list with balances and a refresh button per account (`POST /v1/admin/financial-accounts/{id}/refresh-balance`). **"Create missing accounts"** (`POST /v1/admin/financial-accounts/provision`, `accounts.manage`) sits behind a confirm dialog.
   - **Payouts:**
     - list (`GET /v1/admin/payouts?status=`) and detail;
     - **New payout** (`POST /v1/admin/payouts`, `payouts.manage`): source account select, amount (validated ≤ that account's balance on the client), bank from `GET /v1/admin/banks` (only `canPayTo`), account number, account name, narration;
     - a **review-and-confirm step** that restates the amount in words and figures;
     - one `idempotencyKey` (UUID) generated when the form opens and reused on retries of the same submission; the button is disabled while submitting;
     - after submit, show the status, which arrives later from Monime (poll the detail).
   - **Commission transfers:** list (`GET /v1/admin/transfers?status=&sort=`), detail (`GET /{id}`), and **Retry** for FAILED ones (`POST /{id}/retry`).
   - **Outbox:** list (`GET /v1/admin/outbox?status=`), detail (`GET /{id}`), and **Retry** for DEAD ones (`POST /{id}/retry`).

6. **Reconciliation** (`reconciliation.read` / `.manage`):
   - the summary from `GET /v1/admin/reconciliation`: `counts` are exact, while each list holds at most `listLimit` rows, so link to the full lists below;
   - runs list (`GET /runs?status=`), run detail with its items (`GET /runs/{id}`), and **"Reconcile a day"** (`POST /runs {date}`, default yesterday UTC);
   - items across runs (`GET /items?status=&runId=&kind=`); resolve one (`POST /items/{id}/resolve {resolution}`, with a required note);
   - webhook events list without payloads (`GET /webhook-events?status=&type=&unresolved=`; the cursor is the Monime event id), a viewer with the raw JSON payload (`GET /webhook-events/{id}`), plus **Resolve** (with a note) and **Replay** (FAILED only).

7. **Users** (`users.manage`): list, detail (`GET /v1/admin/users/{id}`), invite (`POST /v1/admin/users`: email, name, role, extraPermissions, departments for HEAD_OF_DEPARTMENT), and edit/deactivate (`PATCH`).
   - The server refuses granting what you don't have, deactivating yourself and removing the last super admin. Show its message.

8. **Audit log** (`audit.read`): `GET /v1/admin/audit-log?entity=&entityId=&actorId=`, with before/after JSON diffs. Link to it from detail pages ("History"), filtered by `entity` and `entityId`.

## Safety rules (money is real)

- Production Monime is **live**. During development, **never** submit payouts, provisioning or transfer retries against the production API. Develop against a local backend running in mock Monime mode (`MONIME_MODE=mock`), or against MSW mocks generated from `openapi.yaml`.
- Every money-moving or irreversible action (payout, provision, retry transfer, replay event, deactivate user, close fee) needs a confirm dialog that names exactly what will happen.
- No secrets in the client. Only the Supabase URL and the publishable (anon) key are public (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). `UNIMAK_API_URL` is server-only.
- Mask nothing the API already masks. Don't log tokens. Don't store tokens anywhere except supabase-js's own session storage.
- Session timeout: sign out after 30 minutes idle.

## Stack

Next.js (App Router), TypeScript strict, Tailwind + shadcn/ui, TanStack Query (cache keys per endpoint and filters; invalidate after mutations), react-hook-form + zod for forms, `@supabase/supabase-js` (+ `@supabase/ssr`), `openapi-typescript` + `openapi-fetch` for the typed client, Vitest + Testing Library, Playwright with MSW for e2e. pnpm. Deployed on Vercel. Use the latest stable versions and pin them.

UX: a desk tool for finance staff.
- Left navigation, dense tables with sortable columns, filters reflected in the URL (shareable links).
- Money right-aligned in tabular figures, status badges (COMPLETED green, PENDING amber, FAILED/EXPIRED grey/red).
- Copy buttons on refs and ids, light and dark mode, usable on a laptop and readable on a phone.
- Loading, empty and error states on every view.
- Dates shown in Africa/Freetown time (UTC+0), ISO in tooltips.

## Working style

- **Plan first and wait for my OK.** Include the route map, components, data layer, auth flow, and a "Backend gaps" list (CORS, if we ever call the API from the browser; anything else you find missing).
- Then work in small commits, one page or feature at a time, running type-check, lint and tests as you go.
- Ask me before adding dependencies beyond the stack above.
- Don't invent API fields or endpoints. Everything must exist in `openapi.yaml`. If something the UI needs is missing, add it to "Backend gaps" and ask.
- Write a README: setup, env vars, the local dev loop against the local backend, how to deploy.
