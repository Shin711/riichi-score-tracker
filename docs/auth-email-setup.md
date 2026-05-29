# Magic-link email setup (Resend + Supabase)

Supabase’s built-in email is capped at **~2 emails/hour** for the whole project. That causes `email rate limit exceeded` when testing login.

**Recommended free provider: [Resend](https://resend.com)** — **3,000 emails/month**, **100/day**, no credit card.

Accounts are optional for this app; only set this up if you want magic-link sign-in and **Claim session**.

---

## 1. Create a Resend account

1. Sign up at [https://resend.com/signup](https://resend.com/signup) (free plan).
2. Go to **API Keys** → **Create API Key** → name it `supabase-auth` → copy the key (starts with `re_`).

---

## 2. Choose a sender address

### Option A — Quick test (you only)

Use Resend’s test sender **`onboarding@resend.dev`**.

- Magic links are only delivered to **the same email you used to sign up for Resend**.
- Good for verifying SMTP works; **not** for your whole mahjong group.

### Option B — Real use (any player email) **recommended**

1. In Resend → **Domains** → **Add Domain** (e.g. `yourdomain.com` or a subdomain like `mail.yourdomain.com`).
2. Add the DNS records Resend shows (SPF, DKIM — usually at your domain registrar or Cloudflare).
3. Wait until status is **Verified**.
4. Use a sender like `Flushing Riichi Mahjong Club <noreply@yourdomain.com>`.

If you only have a Vercel URL and no domain, you still need **some** domain you control for Resend to mail arbitrary addresses.

---

## 3. Configure Supabase SMTP

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project.
2. **Authentication** → **SMTP Settings** (or **Email** → **SMTP**).
3. Enable **Custom SMTP** and enter:

| Field | Value |
|--------|--------|
| **Sender email** | `onboarding@resend.dev` (test) or `noreply@yourdomain.com` (production) |
| **Sender name** | `Flushing Riichi Mahjong Club` |
| **Host** | `smtp.resend.com` |
| **Port** | `465` |
| **Username** | `resend` |
| **Password** | Your Resend API key (`re_...`) |

4. Save.

Reference: [Resend SMTP](https://resend.com/docs/send-with-smtp) · [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)

---

## 4. Raise auth rate limits (after SMTP is on)

1. Supabase → **Authentication** → **Rate Limits**.
2. Suggested starting values for a small club app:

| Setting | Suggested |
|---------|-----------|
| **Emails sent** | `30`–`100` per hour |
| **OTP / magic link cooldown** | `60` seconds (same user) |

Built-in SMTP limits cannot be raised; custom SMTP unlocks higher caps.

---

## 5. Redirect URLs (required for magic links)

**Authentication** → **URL configuration**:

| Setting | Example |
|---------|---------|
| **Site URL** | `https://your-app.vercel.app` |
| **Redirect URLs** | `http://localhost:3000/login` |
| | `https://your-app.vercel.app/login` |

---

## 6. Test

1. Open `/login` on your deployed site (or localhost).
2. Enter an email (must be allowed by your sender — see Option A vs B above).
3. Click **Send magic link** once; check inbox and spam.
4. In Resend → **Emails**, confirm the message was sent.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `email rate limit exceeded` | Wait ~1 hour **or** finish SMTP setup above (built-in limit). |
| No email received | Check spam; confirm domain verified (Option B); test sender only mails your Resend signup email (Option A). |
| Link opens but not signed in | Add your site URL + `/login` to Supabase **Redirect URLs**. |
| Still failing | Resend **Emails** log + Supabase **Authentication** → **Logs**. |

---

## Cost note

Resend free tier is enough for a local mahjong group (100 magic links/day). Upgrade only if you outgrow 3,000/month.
