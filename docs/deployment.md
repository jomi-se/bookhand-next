# Deployment

Bookhand is a static bundle. `npm run build` writes `./dist`; `wrangler.jsonc`
serves that directory as Cloudflare Worker static assets, with
`not_found_handling: "single-page-application"` so a deep link boots the reader
instead of 404ing. There is no Worker script, so no `main` entry.

## How deploys happen: Cloudflare pulls

Deployment uses **Cloudflare Workers Builds**. The repository is connected once
from the Cloudflare dashboard through Cloudflare's GitHub App; from then on every
push to `main` makes Cloudflare clone the repo, run the build, and deploy the
result.

Dashboard settings for the `bookhand` Worker:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Root directory: repository root
- Production branch: `main`

`bookhand.dev` is attached as a custom domain from the dashboard rather than
declared in `wrangler.jsonc`, so DNS and the route stay owner-controlled.

### Why pull rather than push

A GitHub Action that deploys would need a Cloudflare API token stored as a
repository secret. Cloudflare's own git integration needs no credential inside
this repository at all: the trust flows the other way, from the dashboard to
GitHub. That keeps the token out of the repo, out of CI logs, and out of reach
of anything an agent or imported book content could influence.

`npm run deploy` and `npm run deploy:dry` remain as a manual escape hatch for the
owner from an authenticated machine. They are not the normal path, and nothing
in CI calls them.

The GitHub repository must be public for the hackathon submission, but Workers
Builds works with private repositories too, so connecting it does not force the
repo public before the owner chooses.

## Local and tailnet serving

The production CSP blocks Vite's inline dev preamble, so `npm run dev` does not
represent the shipped app. Build and preview instead:

```sh
npm run build && npm run preview
```

`vite.config.ts` allows `.ts.net` hosts in both `server` and `preview`, so the
preview server can be published over the tailnet for device checks. The owner
runs the `tailscale` commands; agents do not.
