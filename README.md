# BarTV — TV Reservation Prototype

Guests scan a QR code at the bar to request what plays on each TV. Staff manage queues and priorities from a live dashboard. All state is synced in real time via Supabase.

## Routes

| Route | Who | Purpose |
|-------|-----|---------|
| `/` | Guests | Choose a TV, pick a game, select priority, submit |
| `/dashboard` | Staff | See all TVs, queues, advance/lock controls |
| `/qr` | Staff | Display QR code for guests to scan |
| `/join` | Guests (via QR) | Landing page with live TV status + CTA |
| `/overlay` | Staff | Broadcast-style overlay preview of all screens |

## Tech stack

- **Next.js 16** (App Router, Turbopack)
- **React 19**
- **Supabase** — Postgres + Realtime subscriptions
- **qrcode.react** — QR generation
- **Vercel** — deployment target

---

## Local development

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local` with your Supabase project values (Project Settings → API):

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Create the database schema

Open **Supabase Dashboard → SQL Editor → New query** and run the contents of:

```
supabase/migrations/001_initial_schema.sql
```

This creates the `tvs` and `requests` tables, enables realtime, and seeds demo data.

### 4. Start dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deploying to Vercel

### Prerequisites

- A Vercel account (free tier is fine)
- The project pushed to a GitHub / GitLab / Bitbucket repo
- Your Supabase project already set up with the migration run

### Step-by-step

1. **Push to GitHub**

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/tv-bar-prototype.git
   git push -u origin main
   ```

2. **Import on Vercel**

   - Go to [vercel.com/new](https://vercel.com/new)
   - Click **Import** next to your repository
   - Framework preset: **Next.js** (auto-detected)
   - Click **Deploy** — the first deploy will fail because env vars are missing; that is expected

3. **Add environment variables**

   In the Vercel project → **Settings → Environment Variables**, add:

   | Name | Value |
   |------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |

   Set both for **Production**, **Preview**, and **Development** environments.

4. **Redeploy**

   In Vercel → **Deployments** → click the three-dot menu on the failed deploy → **Redeploy**.

5. **Verify**

   - `/` loads the TV grid with no errors
   - `/qr` shows a QR code encoding the Vercel domain URL (not localhost)
   - Open two browser tabs; changes in one appear in the other within ~1 second

### Vercel deployment checklist

- [ ] `npm run build` passes locally with no errors
- [ ] Both env vars are set in Vercel for Production, Preview, and Development
- [ ] SQL migration has been run in Supabase (tables exist and are seeded)
- [ ] Realtime is enabled for `tvs` and `requests` in Supabase (migration handles this)
- [ ] `/dashboard` shows all three TVs after deploy
- [ ] Submitting a request from `/` appears on `/dashboard` without a page reload
- [ ] QR code at `/qr` encodes the Vercel domain, not localhost

---

## Database schema

```
tvs
  id              text        PRIMARY KEY   -- 'A' | 'B' | 'C'
  name            text        NOT NULL
  locked          boolean     DEFAULT false
  current_game    text                      -- null = idle
  current_ends_at timestamptz               -- null = idle

requests
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid()
  tv_id       text        REFERENCES tvs(id) ON DELETE CASCADE
  game        text        NOT NULL
  priority    text        CHECK (priority IN ('free','boost','next'))
  created_at  timestamptz DEFAULT now()
```

---

## Security notes (prototype mode)

**Row-level security is currently disabled.** The Supabase anon key is intentionally public (it is embedded in client-side JavaScript as `NEXT_PUBLIC_SUPABASE_ANON_KEY`), so with RLS off anyone can read and write the database.

This is acceptable for a closed demo or investor preview. Before going live with real customers:

1. Enable Supabase Auth (email, magic link, or OAuth)
2. Re-enable RLS on both tables
3. Add policies that restrict write operations to authenticated staff
4. Move the advance/lock/reset operations to a server-side API route using the `service_role` key, which must never be sent to the browser

---

## Local network / quick sharing

To share locally without deploying:

```bash
npx ngrok http 3000
```

This gives a public HTTPS URL. The QR page will automatically display the correct ngrok URL.
