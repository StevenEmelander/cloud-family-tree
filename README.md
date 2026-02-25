# CloudFamilyTree

A self-hosted genealogy platform for families. Deploy your own family tree website to AWS with a single configuration file.

**Live example:** [emelanderfamily.com](https://emelanderfamily.com)

## Features

- Public family tree browsing — no account required
- Interactive tree visualization with ancestors/descendants views
- Person profiles with photos, documents, and biography
- Memorial wall for sharing stories and memories
- Role-based access: visitors, editors, administrators
- GEDCOM import/export
- Serverless AWS architecture — low operating cost, scales automatically
- Single `config.ts` file to customize for your family

## Architecture

- **Frontend:** Next.js 14 (static export), served from S3 + CloudFront
- **API:** Lambda + API Gateway
- **Database:** DynamoDB
- **Auth:** Cognito (user pools, groups)
- **Storage:** S3 (artifacts/photos)
- **Infrastructure:** AWS CDK (TypeScript)
- **Monorepo:** pnpm workspaces + Turborepo

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 8 — `npm install -g pnpm`
- [AWS CLI](https://aws.amazon.com/cli/) configured with credentials that have admin-level access to your target account
- [AWS CDK](https://docs.aws.amazon.com/cdk/latest/guide/getting_started.html) >= 2 — `npm install -g aws-cdk`

If you want to use a custom domain, you'll also need a Route 53 hosted zone for it.

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/your-username/cloud-family-tree.git
cd cloud-family-tree
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure

Copy the example config and fill in your values:

```bash
cp config.example.ts config.ts
```

Then edit `config.ts`. The required fields are:

| Field | Description |
|---|---|
| `familyName` | Short name used for AWS stack names (e.g. `Smith`) |
| `treeName` | Display name for the site |
| `owner` | Your name |
| `awsRegion` | AWS region to deploy to (e.g. `us-east-1`) |
| `awsAccount` | Your 12-digit AWS account ID |
| `admin.email` | Email for the initial admin account |
| `admin.name` | Display name for the admin |

Optional but recommended:

| Field | Description |
|---|---|
| `domain.enabled` | Set `true` to use a custom domain |
| `domain.name` | Your domain (e.g. `smithfamily.com`) |
| `domain.hostedZoneId` | Route 53 hosted zone ID for the domain |
| `monitoring.alertEmail` | Email for budget/error alerts |
| `monitoring.monthlyBudgetUSD` | Monthly spend alert threshold |

See `config.example.ts` for all options and `config.emelander.ts` for a real-world example.

> **Note:** `config.ts` is gitignored. Your deployment values stay local.

### 4. Bootstrap CDK (first time only)

```bash
cd packages/infrastructure
npx cdk bootstrap aws://YOUR_ACCOUNT_ID/YOUR_REGION
cd ../..
```

### 5. Build

```bash
pnpm run build
```

### 6. Deploy

```bash
pnpm run deploy
```

This will:
1. Deploy all CDK stacks (Database, Auth, Storage, API, Hosting)
2. Sync the built frontend to S3
3. Invalidate the CloudFront distribution

The admin account is created automatically using the `admin.email` and `admin.name` values from `config.ts`. Check that inbox for a temporary password.

## Development

```bash
pnpm run dev        # Start all packages in watch mode
pnpm run build      # Full build
pnpm run test       # Unit tests
pnpm run typecheck  # Type checking across all packages
pnpm run lint       # Lint with Biome
pnpm run lint:fix   # Lint and auto-fix
```

### Partial deploys

```bash
pnpm run deploy:backend   # CDK stacks only (no frontend sync)
pnpm run deploy:frontend  # S3 sync + CloudFront invalidation only
```

## Project Structure

```
packages/
  shared/         — Shared TypeScript types and utilities
  api/            — Lambda handlers + DynamoDB access layer
  web/            — Next.js frontend (static export)
  infrastructure/ — AWS CDK stacks
scripts/
  deploy.sh       — Full deploy script
config.example.ts — Blank configuration template
config.emelander.ts — Real-world configuration example
```

## CDK Stacks

Deployed in this order:

| Stack | Purpose |
|---|---|
| `{FamilyName}Family-Database` | DynamoDB table |
| `{FamilyName}Family-Monitoring` | CloudWatch alarms, budget alert |
| `{FamilyName}Family-Auth` | Cognito user pool + groups |
| `{FamilyName}Family-Storage` | S3 bucket for artifacts |
| `{FamilyName}Family-Api` | Lambda functions + API Gateway |
| `{FamilyName}Family-Hosting` | S3 + CloudFront (+ Route 53 if domain enabled) |

## Loading Data

After deploying, the site starts empty. To populate it you can:

- Use the admin interface to add people manually
- Import a GEDCOM file via the admin panel (GEDCOM 5.5 format)

## Integration Tests

The repo includes an integration test suite that tests the live API:

```bash
pnpm test:integ
```

Requires valid AWS credentials and a deployed stack. See [docs/integration-test-plan.md](docs/integration-test-plan.md) for details.

## License

[MIT](LICENSE) — Copyright (c) 2026 Steven Emelander
