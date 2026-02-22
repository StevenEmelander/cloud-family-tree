# Infrastructure Package

AWS CDK stacks for Cloud Family Tree. Changes here affect live infrastructure — always consider cost and operational impact before modifying.

## Stacks

| Stack | Purpose | Deploy order |
|---|---|---|
| `{Family}-Database` | DynamoDB table + GSIs | 1 |
| `{Family}-Monitoring` | CloudWatch alarms, budget alert | 1 |
| `{Family}-Auth` | Cognito user pool + groups | 2 (needs Monitoring) |
| `{Family}-Storage` | S3 bucket for artifacts | 1 |
| `{Family}-Api` | Lambda functions + API Gateway HTTP API | 3 (needs all above) |
| `{Family}-Hosting` | S3 + CloudFront + Route 53 (if domain enabled) | 4 |

Stack names are derived from `config.ts → familyName`. **Never rename CDK construct IDs** — CloudFormation will try to replace the resource, which can cause downtime or data loss.

## Cost considerations — read before adding infrastructure

This project is designed for low-cost personal/family use. Before adding or changing any AWS resource, ask:

1. **Is there a cheaper alternative?** e.g. HTTP API Gateway (~$1/million) vs REST API (~$3.50/million). Lambda on ARM64/Graviton is already used — keep it.

2. **Does this scale cost with usage?** Prefer on-demand/pay-per-use over provisioned capacity. DynamoDB is on-demand; keep it that way unless traffic justifies otherwise.

3. **Does this add ongoing baseline cost?** Some resources cost money even at zero usage (NAT Gateway ~$32/mo, RDS ~$15+/mo). Avoid them. This stack has no baseline network cost by design.

4. **Have you set a retention policy?** CloudWatch log groups must have a retention period set — unbounded logs accumulate cost silently:

   ```typescript
   new LogGroup(this, 'Logs', {
     retention: RetentionDays.ONE_MONTH,
     removalPolicy: RemovalPolicy.DESTROY,
   });
   ```

5. **Does this add a new GSI?** Each DynamoDB GSI adds write amplification (every write to the table also writes to the GSI). Coordinate with the API package — GSIs should only exist if they serve a real access pattern.

6. **Have you right-sized Lambda memory?** Default to 256 MB. Only increase after profiling. Memory directly multiplies compute cost.

7. **Is CloudFront caching configured?** Static assets and API responses that can be cached should be. Cache hits are essentially free; cache misses cost API Gateway + Lambda invocations.

## Conventions

- All stack config (family name, domain, region, account) comes from root `config.ts` — never hardcode values in stack files
- Use `RemovalPolicy.RETAIN` for stateful resources (DynamoDB, S3) in production to prevent accidental data loss
- Lambda functions use `NodejsFunction` with esbuild bundling; `@aws-sdk/*` is excluded (provided by runtime)
- ARM64 (Graviton) for all Lambdas — ~20% cheaper and faster than x86 for Node.js workloads
- The budget alert in `MonitoringStack` will email `monitoring.alertEmail` if monthly spend exceeds `monitoring.monthlyBudgetUSD` — make sure this is configured

## Deploying

From the repo root:

```bash
pnpm run deploy           # Full deploy (CDK + frontend sync)
pnpm run deploy:backend   # CDK stacks only
pnpm run deploy:frontend  # S3 sync + CloudFront invalidation only
```

CDK requires `--require-approval never` in non-TTY environments (CI, scripts). The deploy script handles this automatically.
