# Lumen Website

Single-page marketing site for **Lumen — Technology. Security. Trust.**
A boutique cybersecurity & technology consultancy. Static front end (no framework)
with a serverless contact form backend on AWS.

## Structure

```
lumen-website/
├── index.html              # Page markup (semantic, accessible, trilingual)
├── css/styles.css          # All styles — design tokens, responsive, RTL
├── js/
│   └── main.js             # Hero canvas, i18n, nav, form, scroll animations
├── i18n/
│   ├── en.json             # English — also compiled into js/i18n-init.js at build
│   ├── ar.json             # Arabic   (RTL, _complete: true)
│   └── he.json             # Hebrew   (RTL, _complete: true)
├── assets/                 # Logos, favicons (16/32/512 + apple-touch), og-image
├── infrastructure/
│   ├── template.yaml       # CloudFormation: S3 + CloudFront + API Gateway + Lambda
│   └── lambda/index.mjs    # Contact-form handler → Telegram notification
├── deploy.sh               # Build step → produces dist/
├── deploy-full.sh          # Build + deploy infra + Lambda + S3 sync + CF invalidate
└── dist/                   # Build output (generated; safe to delete & rebuild)
```

`js/i18n-init.js` does **not** exist in source — it is generated from `i18n/en.json`
during the build and written to `dist/js/i18n-init.js`. English strings live in `en.json`
only; the HTML carries English as the default visible text.

## Build

```bash
./deploy.sh
```

Cleans `dist/`, copies assets, minifies CSS/JS (uses `csso`/`terser`/`esbuild` if
installed, otherwise a built-in fallback), compiles `i18n-init.js` from `en.json`,
and assembles a deployable `dist/`. Requires `jq`.

## Deploy (AWS)

```bash
./deploy-full.sh
```

Runs the build, deploys the CloudFormation stack (`lumen`), patches the Lambda
`ALLOWED_ORIGIN` to the live CloudFront domain, pushes the Lambda code from
`infrastructure/lambda/`, syncs `dist/` to S3, and invalidates the CloudFront cache.
Requires the AWS CLI configured with appropriate credentials and `jq`.

### Backend prerequisites (one-time)

The Lambda reads two secrets it does not create:

- **SSM Parameter** `/lumen/prod/origin-verify-secret` (SecureString) — shared secret
  CloudFront injects as the `x-origin-verify` header so only CloudFront can call the API.
- **Secrets Manager** `lumen/telegram-bot-token` — the Telegram bot token.

The Telegram chat ID is set via the `TelegramChatId` CloudFormation parameter.

## Deploy (GitHub Pages — demo/dev)

GitHub Pages is static-only, so there's no Lambda/API Gateway. Use the demo build:

```bash
./build-pages.sh
```

This builds `dist/`, copies it to `docs/`, adds `.nojekyll`, and sets `data-demo="true"`
on `<html>`. In demo mode the contact form **validates and shows a success state
client-side without calling any backend** (no `/api/contact`, no network request), so
nothing 404s. All asset paths are relative, so it works under a project-page subpath.

Publish: commit the repo (root = this folder), then **Settings → Pages → Deploy from a
branch → `main` / `/docs`**. The site goes live at `https://<user>.github.io/<repo>/`.

For correct social-card previews on Pages, update `og:url` / `og:image` in `index.html`
from `https://lumen.co.il` to the Pages URL (cosmetic; not required for the demo).

## Internationalization contract

`en.json`, `ar.json`, and `he.json` must share the **same 84 keys**. Of those:

- 79 are referenced from HTML via `data-i18n="..."`.
- 5 are used only by `main.js` for the contact form:
  `contact.success`, `contact.error`, `contact.error.name`,
  `contact.error.email`, `contact.error.message`.

`ar.json` / `he.json` also carry `"_complete": true`. If a locale is set to
`"_complete": false`, the front end silently falls back to English.

When adding UI copy: add the key to **all three** locale files, then rebuild.

## SEO & social

`index.html` includes favicons, an Apple touch icon, `theme-color`, and Open Graph /
Twitter card meta. The OG tags use absolute URLs based at `https://lumen.co.il` — **update
that domain** (`og:url` and `og:image`) if the site launches on a different host, since
social scrapers require absolute image URLs. The card image is `assets/og-image.png`.

## Security notes

- CSP, HSTS, X-Frame-Options DENY, and related headers are enforced by the
  CloudFront `SecurityHeadersPolicy` (defense-in-depth `<meta>` CSP also in `index.html`).
- Contact API: timing-safe origin-verify check, honeypot field, input sanitization,
  request throttling, reserved concurrency, OAC-locked private S3 bucket.
</content>
</invoke>
