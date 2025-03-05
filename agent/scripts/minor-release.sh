#!/bin/bash
set -e

# Fetch all tags from remote
git fetch --tags

# Get the latest agent tag
latest_tag=$(git tag -l "agent-v*" | sort -V | tail -n 1)
echo "Latest tag: $latest_tag"

# Extract version number from the tag
current_version=${latest_tag#agent-v}
echo "Current version: $current_version"

# Split the version into components
IFS='.' read -r major minor patch <<< "$current_version"

# Increment patch version
new_patch=$((patch + 1))
new_version="$major.$minor.$new_patch"
new_tag="agent-v$new_version"
echo "New version: $new_version"
echo "New tag: $new_tag"

# Update version in package.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$new_version\"/" agent/package.json
echo "Updated version in package.json"

# Print the updated version from package.json
updated_version=$(grep -o '"version": "[^"]*"' agent/package.json | cut -d'"' -f4)
echo "Version in package.json is now: $updated_version"

# Create a new branch with the tag name
git checkout -b "$new_tag"
echo "Created new branch: $new_tag"

# Commit the changes
git add agent/package.json
git commit -m "release $new_tag"
echo "Committed changes"

# Push the branch
git push origin "HEAD:refs/heads/$new_tag"
echo "Pushed branch to origin"

# Create and push the tag
git tag "$new_tag"
git push origin "refs/tags/$new_tag"
echo "Created and pushed tag: $new_tag"

# Create a PR using GitHub CLI
pr_title="Release $new_tag"
pr_body="Automated release PR for version $new_version.

## Test plan

CI"

gh pr create --title "$pr_title" --body "$pr_body" --base main --head "$new_tag"
echo "Created PR for $new_tag"
