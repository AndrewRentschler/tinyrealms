# Convex Local Development Setup

## "Failed to load deployment config" Error

This error occurs when `CONVEX_DEPLOYMENT` in `.env.local` points to a local deployment (e.g. `local:local-xxx`) that does not exist in `~/.convex/convex-backend-state/` on this machine. Common causes:

- Fresh clone or new machine
- `~/.convex` was deleted
- Deployment name came from docs/another developer

## Fix: Re-initialize Local Deployment

### Step 1: Clear the deployment reference

Edit `.env.local` and **remove or comment out** the `CONVEX_DEPLOYMENT` line. For example:

```bash
# CONVEX_DEPLOYMENT=local:local-martin_casado-here
```

### Step 2: Run Convex configure (interactive)

In your project root, run:

```bash
npx convex dev --configure
```

When prompted:
- Choose **Local** (anonymous development without account), or
- Choose **Link to existing Convex project** if you have one

This will create the deployment state in `~/.convex/convex-backend-state/` and update `.env.local` with the correct values.

### Step 3: Start dev

```bash
npm run dev
```

## Alternative: Disable and Re-enable Local Deployments

If you have stale local deployment state:

```bash
npx convex disable-local-deployments
npx convex dev --local
```

When prompted, configure a new local deployment. This clears old config and creates a fresh one.

## Expected .env.local for Local Mode

After setup, `.env.local` should look like:

```bash
CONVEX_DEPLOYMENT=local:local-<your-project-name>
VITE_CONVEX_URL=http://127.0.0.1:3210
VITE_CONVEX_SITE_URL=http://127.0.0.1:3211
```

## Node Version

This project uses Node 22 (see `.nvmrc`). Ensure you're on the correct version:

```bash
nvm use
# or
node -v   # should show v22.x.x
```
