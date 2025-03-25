#!/bin/bash

# this script will gather all the changes between 2 versions and add them to the uncategorized section of the changelog.
# to use this script, you will need to run `vscode/scripts/changelog.sh <from-commit> <to-commit>`

# you can find the commits at each release using:
# git ls-remote https://github.com/sourcegraph/cody | grep "refs/tags/vscode-\(insiders-\)\?v1\.[0-9]\+\.[0-9]\+" | less

# Define paths to include
INCLUDE_PATHS=(
    "jetbrains/"
    "lib/"
    "agent/"
    "vscode/webviews/"
)

# Define domains to group by
DOMAINS=(
    "autocomplete"
    "chat"
    "edit"
    "models"
    "agent"
    "context"
    "prompts"
    "settings"
    "logging"
    "ci"
    "release"
)

# Convert array to awk pattern
PATHS_PATTERN=$(printf "|^%s" "${INCLUDE_PATHS[@]}")
PATHS_PATTERN=${PATHS_PATTERN:1}  # Remove leading |

# Get PR titles with changed files between commits
git log $1..$2 --pretty='format:%s' --name-only --boundary | sed -E 's/^(.*)\(#(.*)\)$/- \1 [pull\/\2](https:\/\/github.com\/sourcegraph\/cody\/pull\/\2)/' > temp_changes.txt

# Process the changes and filter based on paths
awk -v paths="$PATHS_PATTERN" '
BEGIN { pr = ""; files = "" }
/^-/ { 
    if (pr && (files ~ paths)) {
        print pr
    }
    pr = $0
    files = ""
    next
}
/^[a-zA-Z]/ { 
    files = files ? files "\n" $0 : $0
}
END {
    if (pr && (files ~ /^jetbrains\// || files ~ /^lib\// || files ~ /^vscode\/webviews\//)) {
        print pr
    }
}' temp_changes.txt > filtered_changes.txt

# Group changes by type and domain
echo "## Features" > formatted_changes.md
for domain in "${DOMAINS[@]}"; do
    matches=$(grep "^- feat($domain)" filtered_changes.txt)
    if [ ! -z "$matches" ]; then
        echo -e "\n#### $domain" >> formatted_changes.md
        echo "$matches" >> formatted_changes.md
    fi
done
# Catch features without domain
grep "^- feat" filtered_changes.txt | grep -v "^- feat(" >> formatted_changes.md

echo -e "\n### Fixes" >> formatted_changes.md
for domain in "${DOMAINS[@]}"; do
    matches=$(grep "^- fix($domain)" filtered_changes.txt)
    if [ ! -z "$matches" ]; then
        echo -e "\n#### $domain" >> formatted_changes.md
        echo "$matches" >> formatted_changes.md
    fi
done
grep "^- fix" filtered_changes.txt | grep -v "^- fix(" >> formatted_changes.md

echo -e "\n### Changes" >> formatted_changes.md
for domain in "${DOMAINS[@]}"; do
    matches=$(grep "^- changed($domain)" filtered_changes.txt)
    if [ ! -z "$matches" ]; then
        echo -e "\n#### $domain" >> formatted_changes.md
        echo "$matches" >> formatted_changes.md
    fi
done
grep "^- changed" filtered_changes.txt | grep -v "^- changed(" >> formatted_changes.md

echo -e "\n### Chores" >> formatted_changes.md
for domain in "${DOMAINS[@]}"; do
    matches=$(grep "^- chore($domain)" filtered_changes.txt)
    if [ ! -z "$matches" ]; then
        echo -e "\n#### $domain" >> formatted_changes.md
        echo "$matches" >> formatted_changes.md
    fi
done
grep "^- chore" filtered_changes.txt | grep -v "^- chore(" >> formatted_changes.md

# Catch any ungrouped changes
echo -e "\n### Uncategorized" >> formatted_changes.md
grep -v "^- \(feat\|fix\|changed\|chore\)" filtered_changes.txt >> formatted_changes.md