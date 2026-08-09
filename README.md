# Beyond The Classroom with MayorCity — Registration & Ticketing

A simple site for monthly registration in batches of 10 (up to 40 total per
edition). Each applicant downloads a PDF ticket immediately with their
details and uploaded photo. Registration auto-closes once a batch of 10 is
full; you reopen the next batch from the admin panel.

## What's in this project

```
public/                  → the website (Netlify serves this as-is, no build step)
  index.html              → registration form
  lookup.html              → re-download a ticket by code
  admin.html                → admin panel (login, create edition, open/close batches)
  css/style.css
  js/config.js             → your Supabase URL + anon key go here
  js/register.js
  js/admin.js
netlify/functions/
  register.js               → checks the batch limit and generates the PDF ticket
  ticket.js                 → re-generates a ticket PDF from a ticket code
  lib/generateTicket.js      → the actual PDF layout (pdf-lib)
supabase/schema.sql        → run this once in Supabase to create everything
netlify.toml
package.json
```

## 1. Supabase setup

1. Create a project at supabase.com.
2. Go to **SQL Editor** and run the entire contents of `supabase/schema.sql`.
   This creates the `editions` and `registrations` tables, the batch-limit
   logic, and Row Level Security policies.
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

## Notes

- The batch-close check happens inside a database function
  (`register_applicant` in `schema.sql`) that locks the row while checking,
  so two people submitting in the same second near spot #10 can't both
  slip through.
- Applicant photo uploads are public-write (needed since applicants aren't
  logged in). If you want extra protection against abuse, later you can add
  a Netlify Function that generates a short-lived signed upload URL instead —
  happy to add that if it becomes a problem.
- Tickets can always be re-downloaded at `/lookup.html` using the ticket code
  shown after registration.
