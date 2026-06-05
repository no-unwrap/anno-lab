#!/bin/bash
# Upload frontend plugins to S3 for production deployment
#
# Usage:
#   ./deploy/upload_plugins.sh [bucket-name]
#
# Environment variables:
#   PLUGIN_S3_BUCKET - S3 bucket for plugin storage (default: S3_BUCKET)
#   AWS_PROFILE - AWS CLI profile to use (optional)

set -e

BUCKET="${1:-${PLUGIN_S3_BUCKET:-${S3_BUCKET}}}"

if [ -z "$BUCKET" ]; then
    echo "Error: S3 bucket not specified"
    echo "Usage: $0 [bucket-name]"
    echo "Or set PLUGIN_S3_BUCKET or S3_BUCKET environment variable"
    exit 1
fi

echo "Uploading plugins to s3://$BUCKET/plugins/"

FRONTENDS_DIR="$(cd "$(dirname "$0")/../frontends" && pwd)"

if [ ! -d "$FRONTENDS_DIR" ]; then
    echo "Error: frontends directory not found at $FRONTENDS_DIR"
    exit 1
fi

AWS_CMD="aws s3 sync"
if [ -n "$AWS_PROFILE" ]; then
    AWS_CMD="$AWS_CMD --profile $AWS_PROFILE"
fi

# Upload each plugin's dist directory
for plugin_dir in "$FRONTENDS_DIR"/*; do
    if [ ! -d "$plugin_dir" ]; then
        continue
    fi

    plugin_name=$(basename "$plugin_dir")
    manifest_file="$plugin_dir/manifest.json"

    if [ ! -f "$manifest_file" ]; then
        echo "Warning: No manifest.json found in $plugin_name, skipping"
        continue
    fi

    # Extract version from manifest
    version=$(cat "$manifest_file" | python3 -c "import sys, json; print(json.load(sys.stdin).get('version', 'unknown'))")

    # Extract root directory from manifest
    root=$(cat "$manifest_file" | python3 -c "import sys, json; print(json.load(sys.stdin).get('root', 'dist'))")

    dist_dir="$plugin_dir/$root"

    if [ ! -d "$dist_dir" ]; then
        echo "Warning: Build directory $root not found for $plugin_name, skipping"
        echo "  Run 'npm run build' in $plugin_dir first"
        continue
    fi

    s3_path="s3://$BUCKET/plugins/$plugin_name/$version/"

    echo "Uploading $plugin_name (v$version) from $root..."
    $AWS_CMD "$dist_dir/" "$s3_path" \
        --exclude "*.map" \
        --cache-control "public, max-age=31536000, immutable"

    echo "  ✓ Uploaded to $s3_path"
done

echo ""
echo "Plugin upload complete!"
echo ""
echo "To use S3 plugins in production, set these environment variables:"
echo "  USE_S3_PLUGINS=1"
echo "  PLUGIN_S3_BUCKET=$BUCKET  # or S3_BUCKET=$BUCKET"
