# @gamut-all/demo

Portfolio demo app for `gamut-all`. This workspace is intentionally `private` and is not published to npm.

## Run locally

```bash
pnpm install
pnpm demo
```

## Build + preview

```bash
pnpm demo:build
pnpm demo:preview
```

## Hosting

The app is a static Vite build (`examples/demo/dist`), so it can be hosted on:

- Vercel (framework preset: Vite)
- Netlify (`build command: pnpm demo:build`, `publish directory: examples/demo/dist`)
- GitHub Pages (upload `examples/demo/dist` as the artifact)
