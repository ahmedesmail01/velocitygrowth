# Velocity Growth — Campaign Portal

A small campaign portal built for the Velocity Growth engineering task. It puts three brands in the same Supabase project, with separate access to their contacts, campaigns and results.

The brands are Kilele Rides, Karoo Coaches and Marrakech Express. Each has an owner and an analyst. Owners can send campaigns and share results; analysts can view their brand's data.

The main thing I wanted to get right was the data boundary. A hidden button is useful for the interface, but it isn't what stops someone accessing another brand's records. That protection lives in the database.

## Live app

**[velocitygrowth.tbats.org](https://velocitygrowth.tbats.org)** · [Source code](https://github.com/ahmedesmail01/velocitygrowth)

The app is deployed on a Hostinger VPS using Docker, with Nginx in front and a Let's Encrypt certificate. Supabase hosts the database and authentication. A separate worker handles sends and keeps collecting provider reports when the browser is closed.

Data import, sending, provider reporting, Google sign-in and password-protected reports have been exercised during development. Link revocation was also checked in an incognito window. Deployment checks confirmed that the public login page responds over HTTPS.

Reviewer accounts and passwords are supplied separately. There are no login credentials or provider secrets in this README.

## Stack and layout

Next.js, React and TypeScript for the portal, Supabase for Postgres and authentication, and a separate Node.js worker for dispatch and delivery reports.

The application package lives inside `src/`. Run npm commands there, not from the repository root.

| Path | Contents |
| --- | --- |
| `src/app/` | Pages, layouts and the public report page |
| `src/components/` | Shared interface components and access handling |
| `src/lib/` | Supabase client and shared types/helpers |
| `src/public/` | Application assets |
| `src/worker/` | Messaging provider integration and polling worker |
| `src/package.json` | Application dependencies and scripts |
| `db_scripts/` | Database schema, permissions and functions |
| `data_seeders/` | CSV importer, validation and import inspection SQL |
| `Dockerfile` | Separate web and worker build targets |
| `.github/workflows/images.yml` | Build and publish container images |
| `deploy/` | Compose, Nginx configuration and release script |
| `DEPLOYMENT.md` | Detailed VPS setup instructions |
| `task/` | Assessment brief |

The SQL files in this layout are:

- `db_scripts/schema.sql`
- `db_scripts/functions.sql`
- `db_scripts/privilages.sql`
- `db_scripts/portal_reporting.sql`
- `db_scripts/sending_and_sharing.sql`
- `db_scripts/verify.sql`

The permissions filename is `privilages.sql` in this repository. These are not an alphabetical migration sequence. The database was set up incrementally during the build. The clean-install order still needs to be checked against the reorganized scripts, including the recipient-preview performance fix. Don't run the whole folder over an existing populated project.

## Run locally

Use Node.js 22 or newer and the configured Supabase project.

From the repository root:

```bash
cd src
npm ci
```

Create `src/.env.local` with:

```env
NEXT_PUBLIC_SUPABASE_URL=https://assoltaoxnkcfaujibma.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Then, from `src/`:

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000).

The browser uses the publishable key and the signed-in user's session. It does not need the database password, Supabase secret key or messaging provider key.

For a production build:

```bash
npm run build
npm run start
```

The public environment variables need to be present at build time.

## Run the worker

Create `src/.env.worker`:

```env
SUPABASE_URL=https://assoltaoxnkcfaujibma.supabase.co
SUPABASE_SECRET_KEY=YOUR_SERVER_ONLY_SUPABASE_KEY
MESSAGING_API_KEY=YOUR_ISSUED_PROVIDER_KEY
```

In a second terminal, from `src/`:

```bash
node --env-file=.env.worker worker/run.mjs
```

The worker processes approved jobs automatically. Keep it running while testing sends. In production, Docker Compose runs it as a separate service with a restart policy.

The job payload, retry key and polling cursor are stored in Postgres. Restarting the process resumes that work. The worker polls the provider; this build does not depend on webhooks.

Keep both environment files out of Git. A production worker can read its variables from the hosting environment and run with `node worker/run.mjs`.

## Signing in

Both email/password and Google sign-in are supported. An authenticated user still needs an active entry in `public.brand_memberships`. The administrator-controlled allowlist is `vg_private.approved_accounts`.

An unknown account gets no workspace. Users cannot assign themselves a brand or role.

For local Google OAuth, the Google client uses:

```text
JavaScript origin: http://localhost:3000
Redirect URI: https://assoltaoxnkcfaujibma.supabase.co/auth/v1/callback
```

Supabase's allowed application redirect is `http://localhost:3000/dashboard`. The Google client secret belongs in Supabase's provider settings, not in the frontend.

For production, use:

- Supabase Site URL: `https://velocitygrowth.tbats.org`
- Supabase allowed redirect: `https://velocitygrowth.tbats.org/dashboard`
- Google JavaScript origin: `https://velocitygrowth.tbats.org`

The Google redirect URI remains the Supabase `/auth/v1/callback` URL above. Signing in with Google does not bypass the membership check.

## Deployment

GitHub Actions builds the web and worker images and publishes them to GHCR with the full Git commit SHA as their tag. Publishing happens for `main`; promoting a version on the VPS is a separate, manual step.

The build uses these GitHub repository variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

The worker secrets stay on the VPS in `/etc/velocitygrowth/worker.env`. They are not image build arguments. The web container binds to `127.0.0.1:3100`, and the host's Nginx serves the public domain over HTTPS. DNS is managed in Cloudflare.

To release a built commit on the VPS:

```bash
cd /opt/velocitygrowth/repo
bash deploy/release.sh YOUR_FULL_40_CHARACTER_COMMIT_SHA
```

To inspect the current release:

```bash
cd /opt/velocitygrowth/repo
export VERSION="$(cat /var/lib/velocitygrowth/current)"
docker compose -p velocitygrowth -f deploy/compose.yml ps
docker compose -p velocitygrowth -f deploy/compose.yml logs --tail=50 worker
```

To return to the previous recorded release:

```bash
bash deploy/release.sh "$(cat /var/lib/velocitygrowth/previous)"
```

The release script pulls both images before updating the services and attempts to restore the previous version if startup fails. This rolls back containers, not database changes. Container replacement can briefly interrupt requests; this is not a zero-downtime deployment.

See [DEPLOYMENT.md](DEPLOYMENT.md) for first-time setup, certificate configuration and private-package access.

## Data and numbers

The importer lives in `data_seeders/`. After the database prerequisites are in place, copy its `.env.example` to `.env`, supply the database connection privately, and run:

```bash
cd data_seeders
npm ci
npm run import
```

The import downloads and verifies the supplied archive. All 11 source files were processed for this deployment. `data_seeders/verify.sql` helps inspect import totals and issues.

The supplied data contains inconsistent headers, duplicate rows, invalid fields and events without matching records. The importer records what was accepted, rejected or flagged. Import reports expose the file, row and safe reason so those problems can be inspected from the portal.

Customer identity is scoped to a brand. Reimporting an export does not create another set of customers, and the Kilele delta export updates existing records as well as adding new ones.

A few counting choices matter:

- Total customers excludes soft-deleted records.
- Contactable customers need consent, an eligible status, a valid channel destination and no applicable suppression. Email-or-SMS totals count a customer once.
- The signup chart covers today and the preceding 29 dates in the brand's timezone.
- Campaign-export totals are shown separately from observed event counts.
- A send counts distinct eligible destinations. Two customer records sharing one address do not receive two copies within that send.
- Delivery and engagement counts are unique per recipient and event type. They can overlap; an opened message can also have a delivery event.

Rejected or unresolved records do not silently become zero-valued events or successful deliveries.

## Sending and reporting

An owner prepares a preview, reviews the saved audience and confirms the exact count. The preview expires after 15 minutes.

Approval freezes the campaign details and recipient list. Later customer edits do not rewrite what was approved. Eligibility is checked again at confirmation and before the first dispatch attempt. If a selected recipient is no longer eligible, the attempt stops for another review rather than silently shrinking the audience.

Retries reuse the same provider payload and idempotency key. Repeated confirmation returns the existing approved send. There is one attempted dispatch per campaign; rejected recipients are not automatically sent again.

The external provider's idempotency contract is part of this guarantee. Once a request may have been accepted, changing its recipients during a retry would be unsafe.

Provider events can repeat or arrive out of order. The worker deduplicates them, preserves suppression after bounces or unsubscribes, and quarantines reports it cannot safely match. An old delivery event cannot undo an unsubscribe.

## Shared reports

An owner can create a password-protected link for one campaign's aggregate results. It exposes no contact list or recipient identifiers.

The link uses a random token; the database stores its hash and a bcrypt password hash. Links expire after 30 days and can be revoked. Unlock attempts are limited per token.

Revocation blocks subsequent access. It cannot remove information that someone has already viewed or copied.

## Where to inspect a send

| Table | What it records |
| --- | --- |
| `public.send_runs` | Approval, status, provider batch ID, counts and last sync |
| `public.send_recipients` | The saved audience |
| `public.send_receipts` | Acceptance or rejection for each recipient |
| `public.engagement_events` | Accepted normalized events |
| `public.contact_suppressions` | Channel suppression |
| `public.share_links` | Share-link expiry and revocation metadata |
| `vg_private.send_jobs` | Worker payload, leases, retry key and cursor |
| `vg_private.provider_issues` | Reports needing investigation |

Public business tables use brand-scoped RLS and explicit grants. Send/share operations check ownership in database functions. Worker functions require server-side privileges. The public report function returns a specific set of aggregate fields rather than exposing the underlying tables.

## Checks and known limitations

During the build, isolated database and mocked worker tests covered brand isolation, repeated confirmation, immutable approvals, retries, event ordering, suppression and protected reports. An RLS-removal check demonstrated that the isolation test detects the missing protection. These are local checks, not a claim of production load testing.

The current `src/package.json` still references `tests/reporting.mjs`, `tests/sending.mjs` and `tests/worker.mjs`, but `src/tests/` is missing from the published tree. Those test files and their SQL paths need to be restored before the npm test commands are usable from a fresh checkout. `db_scripts/verify.sql` is useful for inspection, but it does not replace them.

The image workflow checks TypeScript and builds the frontend; it also checks worker JavaScript syntax. The release-script tests use a mocked Docker command and can be run from the repository root:

```bash
python3 deploy/tests/test_release.py
```

A successful image build or an HTTP 200 on the login page does not prove tenant isolation, provider connectivity or a complete send.

One live test of KAR-0013 approved 989 destinations. The provider accepted 500 and rejected 489. At the inspected snapshot there were 476 delivered, 24 bounced, 144 opened and 22 unsubscribed. Those are different stages and event categories, not numbers to add together.

One report referenced an external contact ID instead of an approved recipient UUID. It stayed quarantined, and the report screen kept its warning. I would rather show that uncertainty than count an unmatched delivery.

Before submission, the remaining work is:

- Finish checking both login methods for all six accounts.
- Verify the SQL setup order and automated tests after the file reorganization.
- Check worker restart recovery on the deployed service, including its ability to resume polling.
- Complete the production sign-in checks and provide a working, unrevoked report link with its password separately.

## AI use

I used OpenAI Codex to help with implementation, SQL, debugging, tests and documentation. The recipient-preview query needed a performance fix after it timed out against the actual database. Testing the real flow also helped distinguish an unmatched provider event from a successful delivery.

The brief and data are synthetic assessment material. Credentials, private keys and report passwords are kept outside the repository.
