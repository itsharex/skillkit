#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "Usage: ./scripts/bump-version.sh <version>"
  echo "Example: ./scripts/bump-version.sh 1.8.1"
  exit 1
fi

VERSION=$1

echo "Bumping all packages to version $VERSION..."

PACKAGES=(
  "package.json"
  "apps/skillkit/package.json"
  "packages/cli/package.json"
  "packages/core/package.json"
  "packages/tui/package.json"
  "packages/agents/package.json"
  "packages/api/package.json"
  "packages/mcp/package.json"
  "packages/mcp-memory/package.json"
  "packages/memory/package.json"
  "packages/mesh/package.json"
  "packages/messaging/package.json"
  "packages/resources/package.json"
  "docs/skillkit/package.json"
  "docs/fumadocs/package.json"
)

for pkg in "${PACKAGES[@]}"; do
  if [ -f "$pkg" ]; then
    npx -y json -I -f "$pkg" -e "this.version=\"$VERSION\""
    echo "✓ Updated $pkg"
  else
    echo "⚠ Skipped $pkg (not found)"
  fi
done

echo ""
echo "Updating hardcoded versions in website..."

HERO_FILE="docs/skillkit/components/Hero.tsx"
if [ -f "$HERO_FILE" ]; then
  sed -i '' "s/v[0-9]\+\.[0-9]\+\.[0-9]\+<\/span>/v$VERSION<\/span>/" "$HERO_FILE"
  echo "✓ Updated $HERO_FILE"
fi

APP_FILE="docs/skillkit/App.tsx"
if [ -f "$APP_FILE" ]; then
  sed -i '' "s/>v[0-9]\+\.[0-9]\+\.[0-9]\+<\/span>/>v$VERSION<\/span>/" "$APP_FILE"
  sed -i '' "s/\">[0-9]\+\.[0-9]\+\.[0-9]\+<\/span>/\">$VERSION<\/span>/" "$APP_FILE"
  echo "✓ Updated $APP_FILE"
fi

echo ""
echo "All packages updated to version $VERSION"
echo ""
echo "Next steps:"
echo "  1. git add -A"
echo "  2. git commit -m \"chore: bump version to $VERSION\""
echo "  3. git push origin main"
echo "  4. gh release create v$VERSION --generate-notes"
