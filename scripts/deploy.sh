#!/usr/bin/env bash
set -euo pipefail

# Full deploy script: build, deploy CDK stacks, sync frontend, invalidate CloudFront
# Usage: ./scripts/deploy.sh [--skip-build] [--frontend-only] [--backend-only]
#
# The hosting stack name is derived automatically from config.ts (requires tsx).
# You can override it by setting STACK_PREFIX before running:
#   STACK_PREFIX=YourFamilyFamily ./scripts/deploy.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

SKIP_BUILD=false
FRONTEND_ONLY=false
BACKEND_ONLY=false

for arg in "$@"; do
  case $arg in
    --skip-build) SKIP_BUILD=true ;;
    --frontend-only) FRONTEND_ONLY=true ;;
    --backend-only) BACKEND_ONLY=true ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

# Determine stack prefix from config.ts (familyName + "Family")
STACK_PREFIX="${STACK_PREFIX:-}"
if [ -z "$STACK_PREFIX" ]; then
  STACK_PREFIX=$(npx tsx --eval "import('./config.ts').then(m => process.stdout.write(m.config.familyName + 'Family'))" 2>/dev/null || echo "")
fi
if [ -z "$STACK_PREFIX" ]; then
  echo "ERROR: Could not determine stack prefix from config.ts."
  echo "Set it manually: export STACK_PREFIX=YourFamilyFamily"
  exit 1
fi

# Get stack outputs
SITE_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name "${STACK_PREFIX}-Hosting" \
  --query "Stacks[0].Outputs[?OutputKey=='SiteBucketName'].OutputValue" \
  --output text 2>/dev/null || echo "")

DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
  --stack-name "${STACK_PREFIX}-Hosting" \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" \
  --output text 2>/dev/null || echo "")

if [ -z "$SITE_BUCKET" ] || [ -z "$DISTRIBUTION_ID" ]; then
  echo "ERROR: Could not read Hosting stack outputs. Deploy CDK stacks first."
  exit 1
fi

echo "==> Stack prefix: $STACK_PREFIX"
echo "==> Site bucket: $SITE_BUCKET"
echo "==> Distribution: $DISTRIBUTION_ID"

# Step 1: Build
if [ "$SKIP_BUILD" = false ]; then
  echo ""
  echo "==> Building all packages..."
  pnpm run build
fi

# Step 2: Deploy CDK (backend + infra)
if [ "$FRONTEND_ONLY" = false ]; then
  echo ""
  echo "==> Deploying CDK stacks..."
  cd packages/infrastructure
  npx cdk deploy --all --require-approval never
  cd "$ROOT_DIR"
fi

# Step 3: Sync frontend to S3 + invalidate CloudFront
if [ "$BACKEND_ONLY" = false ]; then
  echo ""
  echo "==> Syncing frontend to S3..."
  aws s3 sync packages/web/out "s3://$SITE_BUCKET" --delete

  echo ""
  echo "==> Invalidating CloudFront..."
  aws cloudfront create-invalidation \
    --distribution-id "$DISTRIBUTION_ID" \
    --paths "/*" \
    --output text

  echo ""
  echo "==> Frontend deployed! CloudFront invalidation in progress."
fi

echo ""
echo "==> Deploy complete!"
