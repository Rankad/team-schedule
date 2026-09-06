# Club branding — logo, colours, share preview

**Date:** 2026-09-06
**Status:** partially in implementation (2026-09-06). Stakeholder decision:
**defer everything that needs the logo asset** (§4 header lockup, §5 favicon /
apple-touch-icon / manifest / `og:image`). Proceeding now: **§3 palette recolour**
+ the `theme-color` meta + the text-only OG/Twitter tags (`og:type`, `og:title`,
`og:description`, `og:locale`, `twitter:card` — no `og:image` yet). The deferred
items wait on §7 Q1 (a high-res / SVG logo from the club).
**Relates to:** `docs/ui-ux-spec.md` (visual language), `docs/known-constraints.md`
(courtesy: club approved the app, OQ-6). Independent of the rides
player-mode change (`2026-09-06-rides-remove-player-to-parent-switch-design.md`).

---

## 1. Why

The app is unbranded — a system-font wordmark "גלבוע מעיינות" on white, a teal
accent chosen for contrast, no favicon, no icon, no share preview. Parents are
told to share the link (constraint: "the link may be shared with parents"), and a
raw `*.pages.dev` URL with no title card or icon reads as untrustworthy in a
WhatsApp message. Giving the app the club's own red-and-white identity makes it
recognisably *the club's tool*, which is the whole point.

This is presentation only. No behaviour, data, parser, or API change.

---

## 2. What the club's identity is (researched 2026-09-06 from gilboamaayanot.co.il)

| token | value | where it's used on their site |
|---|---|---|
| **Primary red** | `#D0212C` (rgb 208, 33, 44) | top nav bar, headings, buttons, logo basketball |
| **Ink / ring** | near-black `#1a1a1a` | logo outer ring + Hebrew ring text |
| **Page tint** | `#F5ECED` (very pale rose) — a gradient from white | page background on content pages |
| white | `#ffffff` | nav text, logo fill | 
| font | system stack (`-apple-system, "Segoe UI", Roboto, Arial…`) | body — **identical to our app already** |

**Logo:** `https://www.gilboamaayanot.co.il/assets/img/logo.png` — a **170×170**
circular emblem: black ring carrying the Hebrew text *מועדון כדורסל · גלבוע
מעיינות*, a red basketball with a red "GM"-style monogram at the centre, white
inside-fill. Low resolution (170px) — fine for a ~28–40px header mark and a
favicon, **not** enough for a 512px icon or a share image without looking soft.

Favicon on their site: `https://www.gilboamaayanot.co.il/logoIcon.png`.

The regional-council crest (`logoG.png`, `eh.png`) is a *partner* mark, not the
club's — **do not use it**.

---

## 3. Proposed palette change (`public/styles.css` `:root`)

| var | now | proposed | note |
|---|---|---|---|
| `--accent` | `#1d6a8c` | **`#D0212C`** (the club's exact red) | fills with white text (buttons, chips, selected toggle half) **and** accent-coloured small text on white. White-on-`#D0212C` and `#D0212C`-on-white are both ≈ **5.3:1** — clears AA (4.5:1) for normal text. Verify in the plan with a checker, but no adjustment is expected. |
| `--accent-dark` | `#14506b` | **`#A81B24`** | `:active`/pressed state, and anywhere a heavier accent text is wanted (`.ride-del`, `.rides-load-error`, `.week-arrow` glyph). ≈ **7.4:1** on white ✓. |
| `--bg` | `#f4f5f7` | **`#f6f3f4`** | a barely-there warm shift toward the club's rose tint. Optional — keeping `#f4f5f7` is fine too (see §7 Q2). |
| `--surface` | `#ffffff` | unchanged | |
| `--text` / `--muted` / `--border` | — | unchanged | |
| `--banner-bg` / `--banner-border` | `#fff4e5` / `#f0c68a` | unchanged | the changes banner stays amber — it is an *attention* signal, deliberately not the brand colour, and amber-on-red is a fine, legible pairing. |

**Team-colour palette (`app.js` `PALETTE`) is untouched.** It is 8 hand-picked
hues for distinguishing followed teams; none is the brand red (`#b02a5b` rose is
the closest and is clearly distinct). Team identity and brand accent are
independent on purpose.

**Contrast is a release gate** (`qa-checklist.md` already requires ≥ 4.5:1). The
implementation plan verifies every `--accent`/`--accent-dark` use against its
background with a contrast check, not by eye.

---

## 4. Logo in the header

`public/index.html` `.site-header .wrap` currently: just
`<div class="club-name">גלבוע מעיינות</div>`.

Change to a small horizontal lockup, RTL (mark leads on the right):

```html
<div class="club-brand">
  <img src="brand/logo.png" srcset="brand/logo.png 1x, brand/logo@2x.png 2x"
       width="32" height="32" alt="" class="club-logo" aria-hidden="true">
  <span class="club-name">גלבוע מעיינות</span>
</div>
```

- `alt=""` + `aria-hidden` — the wordmark already names the club; the image is
  decorative, no need for a screen reader to announce "logo".
- CSS: `.club-brand { display:flex; align-items:center; justify-content:center;
  gap:.5rem; }`. `.club-logo { width:32px; height:32px; flex:none; }`. Keep the
  header height near what it is now (logo ≈ the current `.club-name` cap height +
  a little).
- `manager.html` — apply the same lockup to the `#mgr-login` dialog heading and,
  if there is a manager header bar, there too. Low priority; the coordinator is
  one bookmarked user. Fine to do in the same pass.

---

## 5. Icons & share preview (`public/index.html` `<head>`, + `manager.html`)

Currently **none**. Add:

```html
<link rel="icon" href="brand/favicon.ico" sizes="any">
<link rel="icon" href="brand/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="brand/apple-touch-icon.png"><!-- 180×180 -->
<link rel="manifest" href="brand/site.webmanifest">
<meta name="theme-color" content="#D0212C">

<meta property="og:type" content="website">
<meta property="og:title" content="הלו״ז שלי — גלבוע מעיינות">
<meta property="og:description" content="רק האימונים של הקבוצה שלך, לשבוע הקרוב.">
<meta property="og:image" content="brand/og-cover.png"><!-- 1200×630, absolute URL at build or hard-coded to the prod origin -->
<meta property="og:locale" content="he_IL">
<meta name="twitter:card" content="summary_large_image">
```

- **`og:image`** — a 1200×630 card: club logo + "הלו״ז שלי · גלבוע מעיינות" on
  white or the red. This is the thing that makes a shared link look real in
  WhatsApp. It needs the URL to be absolute; either the build step rewrites it to
  the deploy origin, or we hard-code the known Pages URL (document which in
  `RIDES.md` / `HOSTING.md`).
- **`site.webmanifest`** — `name`, `short_name` ("גלבוע מעיינות"), `start_url` `/`,
  `display: standalone`, `background_color` `#ffffff`, `theme_color` `#D0212C`,
  `icons` (192, 512, maskable). Lets a parent "add to home screen" and get the
  club icon, not a screenshot. The app is already offline-tolerant for the
  schedule half, so a basic manifest is honest.
- **No service worker** in this spec — that is a real offline-PWA decision with
  its own caching/staleness questions (the schedule data refreshes 3×/day). Out
  of scope; note it as a future item.

All icon/image assets live in **`public/brand/`**, committed to the repo. Nothing
is hotlinked from the club's site.

---

## 6. Asset production

We do **not** have print-quality source art. Plan:

1. **Ask the stakeholder for the logo as SVG or a ≥ 512px PNG** (§7 Q1). The club
   had this made; someone has the file.
2. **Until then**, derive what we can from the 170px `logo.png`:
   - `favicon.svg` — ideally hand-trace the mark to a small SVG (ring + basketball
     + monogram) so it stays crisp; acceptable interim: `favicon.ico` (16/32/48)
     + `apple-touch-icon.png` (180) downscaled/padded from the 170px source (180
     from 170 is a ~6% upscale — tolerable).
   - `icon-192.png` — a slight upscale, acceptable; `icon-512.png` — **not**
     acceptable from 170px, needs the real source, so the manifest ships with
     192 + maskable only until Q1 is answered, or the whole manifest waits.
   - `og-cover.png` — composited in code/design tool: the mark at a safe size on
     a flat field + the Hebrew title set in the system font. The mark at ~200px
     on a 1200×630 canvas is within what 170px source allows.
3. Record the final asset origins and sizes in a short `public/brand/README.md`.

---

## 7. Open questions (need a stakeholder answer before the plan)

**Q1 — Logo source.** Can the club supply the logo as SVG or a high-res PNG
(≥ 512px, transparent)? This decides whether we ship the full icon set +
`og:image` now, or ship the header logo + favicon now and add the 512 icon /
polished share card in a follow-up.

**Q2 — How much brand, this pass?**
- **A — Minimal:** `--accent`/`--accent-dark` recolour + header logo + favicon.
  Smallest diff, no share-preview work.
- **B — Recommended:** A + `apple-touch-icon` + web manifest + OG/Twitter share
  tags + `og:image` card. Directly serves the "parents share the link" use case;
  ~half a day more.
- **C — Full:** B + themed dialogs/splash, manager-page rebrand, PWA service
  worker. Not recommended now — the service worker is its own decision.

**Q3 — Courtesy.** The club approved the *app* (OQ-6). Using their **logo and
colours** is a small extra step worth a heads-up: "we're giving the app the
club's look so it's recognisably yours — OK?" Recommend sending that note before
this ships. Low risk (it is the club's own tool), but it is their mark.

---

## 8. Files touched (once Q1–Q3 are answered)

| file | change |
|---|---|
| `public/styles.css` | `:root` accent vars (§3); `.club-brand` / `.club-logo` rules (§4) |
| `public/index.html` | header lockup (§4); `<head>` icons + manifest + OG tags (§5) |
| `public/manager.html` | same `<head>` additions; login-dialog lockup (§4) |
| `public/brand/` | **new** — `logo.png` (+`@2x`), `favicon.ico`, `favicon.svg`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` (pending Q1), `site.webmanifest`, `og-cover.png`, `README.md` |
| `docs/ui-ux-spec.md` | record the brand palette + logo lockup as the app's visual language |
| `docs/decision-log.md` | **DL-036** — adopt the club identity (`#D0212C` accent, replacing the contrast-chosen teal; header logo lockup; favicon/manifest/OG). Record that the club's exact red clears AA on white (≈5.3:1), so no tint adjustment was needed |
| `docs/known-constraints.md` | brand assets are self-hosted in `public/brand/`; 170px source is the current ceiling until the club provides SVG |
| `tests/site_smoke.js` | header still renders the club name; new `<img>` has empty `alt`; no broken-asset assertion needed (smoke DOM is fake) |

---

## 9. Testing

- `node tests/site_smoke.js` green (header assertion updated for the lockup).
- Manual, real browser: favicon shows in the tab; `theme-color` tints mobile
  Chrome's bar; "add to home screen" shows the club icon; paste the prod link
  into WhatsApp/Slack → title + description + cover card render.
- Contrast: every `--accent` / `--accent-dark` foreground/background pair checked
  ≥ 4.5:1 (or ≥ 3:1 for large text / UI components, per WCAG) with a tool.
- `pytest` and the Functions job are unaffected (no code path changes).
