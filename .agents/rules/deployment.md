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
