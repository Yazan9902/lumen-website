#!/usr/bin/env bash
set -euo pipefail

# Lumen — Full Deploy Script
# Builds dist/, deploys infrastructure (CFN) + website files (S3) + Lambda code

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STACK_NAME="lumen"
TEMPLATE="infrastructure/template.yaml"
LAMBDA_DIR="$SCRIPT_DIR/infrastructure/lambda"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"

echo "=== Building dist/ ==="
bash "$SCRIPT_DIR/deploy.sh"
WEBSITE_DIR="$SCRIPT_DIR/dist"

echo "=== Deploying CloudFormation stack ==="
aws cloudformation deploy \
  --template-file "$TEMPLATE" \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-fail-on-empty-changeset \
  --region "$REGION"

# Get outputs
CF_DOMAIN=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`WebsiteUrl`].OutputValue' --output text)
CF_DIST_ID=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' --output text)
S3_BUCKET=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`S3BucketName`].OutputValue' --output text)

echo "CloudFront: $CF_DOMAIN"
echo "Distribution: $CF_DIST_ID"
echo "S3 Bucket: $S3_BUCKET"

echo ""
echo "=== Updating Lambda ALLOWED_ORIGIN ==="
# Read current env vars and only update ALLOWED_ORIGIN to avoid overwriting other vars
CURRENT_ENV=$(aws lambda get-function-configuration \
  --function-name lumen-contact-api \
  --query 'Environment.Variables' --output json)
UPDATED_ENV=$(echo "$CURRENT_ENV" | jq --arg origin "$CF_DOMAIN" '.ALLOWED_ORIGIN = $origin')
aws lambda update-function-configuration \
  --function-name lumen-contact-api \
  --environment "Variables=$UPDATED_ENV" \
  --query 'Environment.Variables.ALLOWED_ORIGIN' --output text

echo ""
echo "=== Deploying Lambda code ==="
cd "$LAMBDA_DIR"
zip -j lambda.zip index.mjs
aws lambda update-function-code \
  --function-name lumen-contact-api \
  --zip-file fileb://lambda.zip \
  --query 'LastModified' --output text
rm -f lambda.zip
cd "$SCRIPT_DIR"

echo ""
echo "=== Syncing website files to S3 ==="
aws s3 sync "$WEBSITE_DIR" "s3://$S3_BUCKET/" \
  --exclude ".git/*" \
  --exclude "deploy.sh" \
  --exclude "deploy-full.sh" \
  --exclude "dist/*" \
  --exclude "infrastructure/*" \
  --exclude "*.yaml" \
  --exclude "*.md" \
  --delete

echo ""
echo "=== Invalidating CloudFront cache ==="
aws cloudfront create-invalidation \
  --distribution-id "$CF_DIST_ID" \
  --paths "/*" \
  --query 'Invalidation.Id' --output text

echo ""
echo "=== Deploy complete ==="
echo "Website: $CF_DOMAIN"
echo "Contact form: ${CF_DOMAIN}/api/contact"
