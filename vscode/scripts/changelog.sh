# !/bin/bash

# kalan's poor man changelog generator (h/t unknwon), this will be replaced by the release team's changelog automation

# this script will gather all the changes between 2 versions and add them to the uncategorized section of the changelog.
# to use this script, you will need to run `vscode/scripts/changelog.sh <from-commit> <to-commit>`

# you can find the commits at each release branch using:
# git ls-remote https://github.com/sourcegraph/cody | grep "refs/heads/vscode-v1\.[0-9]\+\.x" | sort -r | head -n 5

git log $1..$2 --pretty='%s' --boundary | sed -E 's/^(.*)\(#(.*)\)$/- \1 [pull\/\2](https:\/\/github.com\/sourcegraph\/cody\/pull\/\2)/' > temp_changes.txt

# Find first occurrence of ### Uncategorized and append the changes right after it
awk '/### Uncategorized/{if (!found) {print; system("cat temp_changes.txt"); found=1; next}} 1' vscode/CHANGELOG.md > temp_changelog.md

# Replace original file with new content
mv temp_changelog.md vscode/CHANGELOG.md

# Clean up
rm temp_changes.txt

