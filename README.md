# DDM Instagram SEO Audit — A to Z Setup

## 1. Files

Upload these files to a new GitHub repository / Render service:

- `server.js`
- `package.json`
- `.env.example`
- `public/index.html`

Do NOT upload `.env`.

## 2. Instagram / Meta Developer App

Use your existing Meta/Instagram app.

The application must be configured for Instagram Login and the permission:

`instagram_business_basic`

Set the OAuth redirect URI to EXACTLY:

`https://YOUR-RENDER-SERVICE.onrender.com/auth/instagram/callback`

The redirect URI must match the value in Render's `INSTAGRAM_REDIRECT_URI` exactly.

## 3. Render

Create a Web Service from the GitHub repository.

Build command:

`npm install`

Start command:

`npm start`

Add environment variables:

`INSTAGRAM_CLIENT_ID`
`INSTAGRAM_CLIENT_SECRET`
`INSTAGRAM_REDIRECT_URI`
`PUBLIC_BASE_URL`
`SESSION_SECRET`
`NODE_ENV=production`

For `PUBLIC_BASE_URL`, use the URL where the frontend is hosted.

### IMPORTANT

If frontend is hosted on GitHub Pages and backend on Render, this project intentionally expects the OAuth callback to redirect to the GitHub Pages URL.

Example:

`PUBLIC_BASE_URL=https://yourname.github.io/your-repo/`

The frontend JavaScript calls the Render API only when the frontend and backend are separated. If you want the easiest deployment, host the `public` folder from this same Express server and use the Render URL as both the website and API.

## 4. Recommended easiest deployment

For the first working version, deploy EVERYTHING on Render.

Then:

`https://YOUR-RENDER-SERVICE.onrender.com`

is both:
- website
- API
- OAuth callback host

Set:

`PUBLIC_BASE_URL=https://YOUR-RENDER-SERVICE.onrender.com/`

and

`INSTAGRAM_REDIRECT_URI=https://YOUR-RENDER-SERVICE.onrender.com/auth/instagram/callback`

This avoids CORS and GitHub Pages routing issues.

## 5. Test

Open the Render URL.

Click:

`Connect Instagram for Free Audit`

Complete Instagram authorization.

Instagram redirects to:

`/auth/instagram/callback`

The server:
1. Exchanges the authorization code.
2. Gets the Instagram access token.
3. Fetches the connected profile.
4. Calculates the preliminary audit.
5. Stores the temporary result server-side.
6. Redirects to the website.
7. The frontend loads the audit result.

## 6. What the free audit can and cannot do

This implementation uses the official Instagram API for the CONNECTED account.

The `Analyze` field does NOT scrape arbitrary Instagram accounts. If the requested username is not the account currently connected, the server asks the visitor to connect the correct account.

This is intentional: do not build the product around unofficial Instagram scraping.

## 7. Paid audit

The current CTA points to:

`hello@divyom.com`

and is priced at ₹999.

The paid audit workflow is intentionally not pretending to be complete yet. Add payment + order storage + report generation after the free audit is stable.

## 8. Security

- Instagram access tokens remain server-side.
- Do not put `INSTAGRAM_CLIENT_SECRET` in frontend code.
- Do not commit `.env`.
- Use a strong `SESSION_SECRET`.
- The temporary audit ID expires after 30 minutes in this MVP.

## 9. Production database

This MVP uses an in-memory temporary audit store. It is fine for initial testing, but Render restarts can clear it.

For production, replace `auditStore` with Postgres/Redis and store:
- user/session
- Instagram user ID
- encrypted token
- audit
- payment/order
- report URL
