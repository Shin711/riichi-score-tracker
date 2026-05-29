# Google sign-in setup (Supabase + Google Cloud)

Use this to enable **Continue with Google** on `/login`. No Resend/SMTP required for Google sign-in.

You need:

1. A Supabase project (you already have this)
2. A Google Cloud project (free)
3. ~15 minutes

---

## Part A — Find your Supabase callback URL

You will paste this into Google Cloud later.

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project.
2. Go to **Authentication** → **Providers** → **Google**.
3. **Do not enable Google yet** — leave the toggle **off** until Part C (after you create credentials in Google Cloud).
4. Still on that page, copy the **Callback URL (for OAuth)** shown there (visible even when Google is disabled).

It looks like:

```text
https://drgzoyntsgrqdwzbrkjf.supabase.co/auth/v1/callback
```

Your project ref (`drgzoyntsgrqdwzbrkjf`) will differ — use **your** URL exactly.

---

## Part B — Google Cloud Console (detailed)

### B1. Open the console and pick a project

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Sign in with the Google account you want to own the OAuth app (can be personal).
3. Top bar → **Select a project** → **New Project**.
4. Name it e.g. `flushing-riichi-mahjong-club` → **Create**.
5. Wait until created, then select that project in the top bar.

### B2. Configure the OAuth consent screen (required first)

1. Left menu → **APIs & Services** → **OAuth consent screen**.
2. **User Type** → choose **External** → **Create**.
3. **App information**
   - **App name:** `Flushing Riichi Mahjong Club`
   - **User support email:** your email
   - **Developer contact email:** your email
4. **Save and Continue**.
5. **Scopes** → **Add or Remove Scopes** → ensure these are included (Supabase needs profile + email):
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - `openid`
6. **Save and Continue**.
7. **Test users** (while app is in "Testing"):
   - Click **Add users**
   - Add **every Gmail address** that should be able to sign in during testing (including yours)
   - Only listed test users can log in until you publish the app
8. **Save and Continue** → back to **Dashboard**.

**Testing vs Production**

| Mode | Who can sign in |
|------|------------------|
| **Testing** | Only emails you add under **Test users** |
| **In production** | Any Google account (after you click **Publish app** on consent screen) |

For a small mahjong group, **Testing + add your friends’ Gmail addresses** is often enough. When ready for anyone, go to **OAuth consent screen** → **Publish app**.

You do **not** need to enable any extra Google APIs for basic Google sign-in.

### B3. Create OAuth Client ID

1. Left menu → **APIs & Services** → **Credentials**.
2. **+ Create Credentials** → **OAuth client ID**.
3. **Application type:** **Web application**.
4. **Name:** `Flushing Riichi Mahjong Club Web`.

5. **Authorized JavaScript origins** — click **+ Add URI** for each:

   | Environment | URI |
   |-------------|-----|
   | Local dev | `http://localhost:3000` |
   | Production | `https://YOUR-VERCEL-APP.vercel.app` |

   Example production: `https://flushing-riichi-mahjong-club.vercel.app`

   No trailing slash. No path (not `/login`).

6. **Authorized redirect URIs** — click **+ Add URI** → paste **only** the Supabase callback from Part A:

   ```text
   https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback
   ```

   This is **Google → Supabase**, not your Vercel URL.

7. Click **Create**.
8. A dialog shows **Client ID** and **Client secret** → copy both (or download JSON). You’ll paste these into Supabase next.

---

## Part C — Connect Google to Supabase

1. Supabase → **Authentication** → **Providers** → **Google**.
2. Fill in **both** fields (Supabase will error if **Client IDs** is empty when Google is enabled):

| Supabase field | What to paste |
|----------------|---------------|
| **Client IDs** | Your Google **Web** OAuth **Client ID** (ends with `.apps.googleusercontent.com`) |
| **Client Secret** | The matching **Client secret** from the same Google OAuth client |

For this web app only, **Client IDs** is a single ID — not comma-separated, not empty.

Example shape (yours will differ):

```text
Client IDs:     123456789-abcdefg.apps.googleusercontent.com
Client Secret:  GOCSPX-xxxxxxxxxxxxxxxx
```

3. Turn **Google enabled** **ON**.
4. **Save**.

If you see *“At least one Client ID is required when Google sign-in is enabled”*, you turned Google on before pasting the **Client IDs** value — paste the Web Client ID from Google Cloud (Part B3) first, then save again.

### C1. URL configuration (your app, not Google)

Supabase → **Authentication** → **URL configuration**:

| Field | Value |
|-------|--------|
| **Site URL** | `https://YOUR-VERCEL-APP.vercel.app` (or `http://localhost:3000` while local-only) |
| **Redirect URLs** | Add each line separately: |

```text
http://localhost:3000/auth/callback
https://YOUR-VERCEL-APP.vercel.app/auth/callback
http://localhost:3000/login
https://YOUR-VERCEL-APP.vercel.app/login
```

The app sends users to `/auth/callback` after Google approves sign-in; that route finishes the session and sends you to `/login`.

---

## Part D — Test

1. Deploy latest code (or `npm run dev` locally).
2. Open `/login`.
3. Click **Continue with Google**.
4. Pick a Google account that is a **Test user** (if consent screen is still in Testing).
5. You should land back on `/login` signed in.
6. Open a session you created → **Claim** → check **My games**.

### Common errors

| Symptom | Fix |
|---------|-----|
| `redirect_uri_mismatch` | Redirect URI in Google must **exactly** match Supabase callback URL (Part A). |
| `access_denied` / can’t sign in | Add that Gmail under **OAuth consent screen → Test users**, or **Publish app**. |
| Redirects but not signed in | Add `/auth/callback` URLs in Supabase **Redirect URLs** (Part C1). |
| Works locally, not on Vercel | Add production origin + callback URLs in **both** Google and Supabase. |

---

## Checklist

- [ ] Google Cloud project created
- [ ] OAuth consent screen configured (External)
- [ ] Test users added (if still in Testing mode)
- [ ] OAuth **Web client** created
- [ ] JavaScript origins: localhost + Vercel URL
- [ ] Redirect URI: `https://<ref>.supabase.co/auth/v1/callback`
- [ ] Client ID + Secret in Supabase Google provider
- [ ] Supabase redirect URLs include `/auth/callback`
- [ ] Tested **Continue with Google** on `/login`

---

## Security notes

- Never put the **Client secret** in your Next.js app or commit it — it lives only in Supabase Dashboard.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the browser is expected; Row Level Security protects data.
