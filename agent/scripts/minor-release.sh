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

# Use pnpm to update the version (patch increment) in the agent directory
echo "Incrementing patch version using pnpm..."
(cd agent && pnpm version patch --no-git-tag-version)

# Get the new version from package.json using jq
new_version=$(jq -r .version agent/package.json)

new_tag="agent-v$new_version"
echo "New version: $new_version"
echo "New tag: $new_tag"

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
