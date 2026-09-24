# Deploy Workflow & CI Rules

When writing code or preparing to push changes to this repository, you must follow these strict steps to ensure the CI/CD pipeline does not fail. The deployment process is fully automated via GitHub Actions, and it requires the code to be perfectly formatted, linted, tested, and built.

## Mandatory Pre-Deployment Checklist

Before committing and pushing ANY code, always run the following steps inside the appropriate project directory (e.g., `backend/`):

1. **Format Code (CRITICAL)**
   - **Command:** `npm run format` (or `pnpm run format`)
   - **Why:** The GitHub Actions `validate` job strictly enforces Prettier. If the code has missing spaces, trailing commas, or lines that are too long, the pipeline **will fail** with an exit code 1. You must run this command to auto-fix formatting issues.

2. **Lint Code**
   - **Command:** `npm run lint` (or `pnpm run lint`)
   - **Why:** Ensures there are no ESLint errors or unused variables that could break the build. Fix any errors reported.

3. **Run Tests**
   - **Command:** `npm run test` (or `pnpm run test`)
   - **Why:** Validates that business logic hasn't been broken. All test suites must pass.

4. **Build Code**
   - **Command:** `npm run build` (or `pnpm run build`)
   - **Why:** Verifies that there are no TypeScript compilation errors.

## How Deployment Works

1. Once the above commands run successfully without errors locally, commit and push your changes to the `main` branch.
2. The **CI** workflow (`.github/workflows/ci.yml`) will trigger automatically on GitHub. It will run `lint`, `test`, and `build`.
3. **If and only if** the CI workflow passes cleanly, it will automatically trigger the **Deploy production** workflow (`.github/workflows/deploy.yml`), which connects via SSH to the VPS and deploys the latest commit.

> [!WARNING]
> If you are an AI agent "vibecoding" for the user, **DO NOT** push code without first running `npm run format` locally. Failing to format the code will waste time and require a second formatting commit.

## GitHub Secrets Configuration (Required for CI/CD)

The GitHub Action (`deploy.yml`) uses SSH to connect to the VPS. If the SSH connection fails with an exit code 1 during the `Desplegar commit validado` step, it is highly likely that the GitHub Secrets are missing or the SSH Key is not correctly authorized on the server.

The following secrets **MUST** be correctly configured under the repository settings: `Settings > Secrets and variables > Actions`:

- `VPS_HOST`: `31.220.17.121`
- `VPS_USER`: `root`
- `VPS_PORT`: `22`
- `VPS_PROJECT_PATH`: `/opt/colombia-sexys`
- `VPS_SSH_KEY`: The private Ed25519 SSH key (`-----BEGIN OPENSSH PRIVATE KEY-----...`).

> [!IMPORTANT]  
> If the `VPS_SSH_KEY` is not authorized on the server's `/root/.ssh/authorized_keys`, GitHub Actions will **silently fail** with an exit code 1 because it cannot use a password to authenticate. If deployments are failing because of this, either update the secrets or perform a manual SSH deployment as a fallback.
