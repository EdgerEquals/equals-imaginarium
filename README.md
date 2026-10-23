# Equals Imaginarium — website

A static, single-page site. Plain HTML/CSS/JS, no build step. Only external dependency: Google Fonts (falls back to system fonts).

```
index.html          page content (all copy lives here — edit freely)
css/styles.css      styles; colour/font tokens at the top under :root
js/main.js          mobile nav, footer year, scroll reveal (site works without JS)
assets/             logo.svg, wordmark.svg, favicon.svg, apple-touch-icon.png, og-image.(svg|png)
```

## Preview locally
```bash
cd equals-imaginarium
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy
- **Netlify Drop:** go to https://app.netlify.com/drop and drag the `equals-imaginarium` folder in.
- **GitHub Pages:** push the folder contents to a repo, then Settings → Pages → Deploy from branch → `main` / root.
- **Vercel:** `npx vercel` inside the folder (framework preset: "Other", no build command), or import the repo at vercel.com/new.

## Placeholders to fill in (search for `PLACEHOLDER` in index.html)
- `hello@example.com` — contact email (mailto link + form action)
- `your-handle` — X and GitHub links in the footer
- `https://example.com/` — canonical / og:url / og:image domain
- Contact form uses `mailto:` (opens the visitor's email app). For a real form, swap the action for Formspree (`https://formspree.io/f/YOUR_FORM_ID`) or add `data-netlify="true"` on Netlify.
- Showcase cards 2 & 3 ("Signals you can see", "Small machines") are placeholder projects.
