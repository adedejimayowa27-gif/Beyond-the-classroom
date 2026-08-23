# Beyond The Classroom with MayorCity — Registration & Ticketing

A simple site for monthly registration in batches of 10 (up to 40 total per
edition). Each applicant downloads a PDF ticket immediately with their
details, uploaded photo, and a scannable QR code. Registration auto-closes
once a batch of 10 is full; you reopen the next batch from the admin panel.

## What's new in this update

- **QR check-in at the door.** Every ticket now has a QR code on it. Open
  `/checkin.html` on any phone, sign in, and scan tickets as guests arrive —
  it marks them checked in and flags a ticket that's already been used.
- **No more duplicate registrations.** The same email address can no longer
  register twice for one edition (previously nothing stopped this).
- **Waitlist.** Once a batch is full, the homepage now shows a waitlist form
  instead of just a "closed" message, so you keep a list of who to reach out
  to the moment the next batch opens.
- **CSV export.** From the admin panel you can export a batch's
  registrations (with check-in status) or its waitlist as a CSV file.
- **Basic spam protection.** A hidden honeypot field quietly discards bot
  submissions to the registration form without touching your database.
- **Ticket code shown after every registration**, with a "copy code" button,
  so applicants who lose the PDF can still find their code in their inbox
  screenshot/chat history.
- **Link tags for social sharing** and a small favicon, so links posted to
  WhatsApp/Instagram show a proper title and description.
- **Admin dashboard totals** — total registrations, checked-in count, and
  waitlist size across every edition, plus a way to remove a mistaken entry.

## What's in this project

```
public/                  → the website (Netlify serves this as-is, no build step)
  index.html              → registration form (+ waitlist form when a batch is full)
  lookup.html              → re-download a ticket by code
  admin.html                → admin panel (login, create edition, open/close batches, CSV export)
  checkin.html               → door check-in scanner (scan or type a ticket code)
  css/style.css
  js/config.js             → your Supabase URL + anon key go here
  js/register.js
  js/admin.js
  js/checkin.js
netlify/functions/
  register.js               → checks the batch limit and generates the PDF ticket
  ticket.js                 → re-generates a ticket PDF from a ticket code
  lib/generateTicket.js      → the actual PDF layout (pdf-lib + QR code)
supabase/
  schema.sql                → run this once in a BRAND NEW Supabase project
  migration_v2.sql           → run this instead if you already had the old schema live
netlify.toml
package.json
```

## 1. Supabase setup

**Already have this project live from before?** Skip to running
`supabase/migration_v2.sql` instead of `schema.sql` (step 2 below) — it
only adds the new columns/tables/policies and won't touch your existing
editions or registrations.

1. Create a project at supabase.com (skip if you already have one).
2. Go to **SQL Editor** and run the entire contents of `supabase/schema.sql`
   (new project) — **or** `supabase/migration_v2.sql` (existing project).
   This creates the `editions`, `registrations`, and `waitlist` tables, the
   batch-limit + duplicate-email logic, check-in columns, and Row Level
   Security policies.
3. Go to **Storage** and create two buckets, both set to **public**:
   - `edition-banners`
   - `applicant-photos`
   (The storage policies at the bottom of `schema.sql` need these buckets to
   exist first — run that part of the SQL after creating the buckets, or
   just re-run the whole file, it's fine if a couple of statements repeat.)
4. Go to **Authentication > Users** and manually create one admin user
   (your own email + a password). This is the login for `/admin.html`.
   There's no public sign-up — only this account can manage editions.
5. Go to **Project Settings > API** and copy:
   - Project URL
   - `anon` `public` key
   - `service_role` key (keep this one secret — never put it in `public/`)

## 2. Fill in your keys

**`public/js/config.js`** (safe to be public):
```js
window.SUPABASE_URL = 'https://xxxx.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJ...';
```

**Netlify environment variables** (Site settings > Environment variables —
never commit these):
```
SUPABASE_URL = https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY = eyJ...   (the secret one)
```

## 3. Push to GitHub, deploy on Netlify

1. Push this folder to a new GitHub repo.
2. In Netlify: **Add new site > Import an existing project** and pick the repo.
   Netlify will read `netlify.toml` automatically — no build command needed
   (publish directory is `public`, functions directory is `netlify/functions`).
3. Add the two environment variables from step 2 above in Netlify's site settings, then deploy.

## 4. Using it monthly

1. Go to `yoursite.netlify.app/admin.html` and sign in.
2. Fill in the edition name (e.g. "August 2026 Edition") and upload that
   month's picture. This creates the edition with **Batch 1 open**.
3. Applicants go to the homepage, register, and instantly download their
   ticket PDF. Once 10 people register, the batch **auto-closes** —
   nobody else can register until you act.
4. When you're ready for the next 10, go to the admin panel and click
   **"Open Batch 2"** (then 3, then 4). After Batch 4 fills, the edition is
   marked complete automatically (40/40) and the form disables itself.
5. Next month, just create a new edition — it becomes the one shown on the
   homepage.

## 5. Checking guests in at the door

1. On the day, open `yoursite.netlify.app/checkin.html` on any phone or
   tablet (it's a normal web page, no app install needed) and sign in with
   the same admin login.
2. Allow camera access. Point it at a guest's ticket QR code — it checks
   them in automatically and shows their name.
3. If the camera isn't available, or the ticket is printed and creased,
   type the code into the "enter the code manually" box instead.
4. Scanning the same ticket twice shows **"Already checked in"** with the
   time, so you can catch someone trying to reuse a ticket or a screenshot.
5. You can also see who's checked in from `/admin.html` (each registration
   shows a green "Checked in" badge) and export the full list as CSV.

## Notes

- The batch-close check happens inside a database function
  (`register_applicant` in `schema.sql`) that locks the row while checking,
  so two people submitting in the same second near spot #10 can't both
  slip through. The same function now also rejects a second registration
  from the same email address within an edition.
- Applicant photo uploads are public-write (needed since applicants aren't
  logged in). If you want extra protection against abuse, later you can add
  a Netlify Function that generates a short-lived signed upload URL instead —
  happy to add that if it becomes a problem.
- Tickets can always be re-downloaded at `/lookup.html` using the ticket code
  shown after registration, or by opening `/lookup.html?code=BTC-XXXXXXXX`
  directly (useful if you ever want to text/email someone a direct link).
- Want the shared link to show a nice preview image on WhatsApp/Instagram?
  Drop a 1200×630 image at `public/og-banner.png` — `index.html` already
  references it. Without that file the link still works fine, it just won't
  show a preview image.
- The QR code on each ticket simply encodes the ticket code text — nothing
  sensitive, so an old/expired ticket photo can't be used to look anyone up
  without also having admin access.
- Not built (out of scope for this pass, but straightforward to add later):
  automatically emailing the ticket PDF at registration time. That needs an
  email-sending service (e.g. Resend) and its own API key — say the word if
  you want that added next.
