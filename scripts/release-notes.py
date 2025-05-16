#!/usr/bin/env python3

import argparse
import re
import subprocess
import sys
from typing import List, Optional, Tuple, Set
import os
from datetime import datetime

# Check for requests dependency
try:
    import requests
except ImportError:
    print("Error: The 'requests' package is required but not installed.")
    print("Please install it using one of the following commands:")
    print("  pip install requests")
    print("  pip3 install requests")
    sys.exit(1)

# GitHub API configuration
GITHUB_API_URL = "https://api.github.com"
GITHUB_REPO = "sourcegraph/cody"
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")

if not GITHUB_TOKEN:
    print("Warning: GITHUB_TOKEN environment variable not set. API rate limits may apply.")
    print("If you need to create new token please visit https://github.com/settings/tokens")

# Headers for GitHub API requests
HEADERS = {
    "Accept": "application/vnd.github.v3+json"
}
if GITHUB_TOKEN:
    HEADERS["Authorization"] = f"token {GITHUB_TOKEN}"

def run_git_command(command: List[str]) -> str:
    """Run a git command and return its output."""
    try:
        result = subprocess.run(["git"] + command, capture_output=True, text=True, check=True)
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        print(f"Error running git command: {e}")
        print(f"Error output: {e.stderr}")
        sys.exit(1)

def fetch_latest_branches_and_tags():
    """Fetch the latest branches and tags from the remote repository."""
    print("Fetching latest branches and tags...")
    run_git_command(["fetch", "--all"])
    run_git_command(["fetch", "--tags"])

def get_release_branches() -> List[str]:
    """Find all M* release branches."""
    remote_branches = run_git_command(["branch", "-r"]).split("\n")
    release_pattern = re.compile(r'origin/M\d+')

    release_branches = []
    for branch in remote_branches:
        branch = branch.strip()
        if release_pattern.search(branch):
            # Remove 'origin/' prefix
            branch_name = branch.split('/')[-1]
            release_branches.append(branch_name)

    # Sort by version number (extract number from 'M{number}')
    release_branches.sort(key=lambda x: int(x[1:]), reverse=True)
    return release_branches

def get_latest_release_branch() -> Optional[str]:
    """Find the latest M* release branch."""
    branches = get_release_branches()
    return branches[0] if branches else None

def get_previous_release_branch(current_branch: str) -> Optional[str]:
    """Find the previous release branch before the specified one."""
    branches = get_release_branches()
    if not branches or current_branch not in branches:
        return None

    current_index = branches.index(current_branch)
    if current_index < len(branches) - 1:
        return branches[current_index + 1]
    return None

def get_commits_between_branches(from_branch: str, to_branch: str) -> List[str]:
    """Get the commits between two branches."""
    commits = run_git_command([
        "log",
        f"origin/{from_branch}..origin/{to_branch}",
        "--pretty=format:%H"
    ]).split("\n")
    return [commit for commit in commits if commit]

def extract_pr_number_from_commit(commit_hash: str) -> Optional[int]:
    """Extract PR number from a commit message."""
    commit_message = run_git_command(["show", "-s", "--format=%B", commit_hash])
    # Look for patterns like (#123) or pull request #123
    pr_pattern = re.compile(r'(?:\(#|\bpull request #|PR #|#)(\d+)')
    match = pr_pattern.search(commit_message)
    if match:
        return int(match.group(1))
    return None

def get_pr_details(pr_number: int) -> dict:
    """Get the details of a PR from the GitHub API."""
    url = f"{GITHUB_API_URL}/repos/{GITHUB_REPO}/pulls/{pr_number}"
    response = requests.get(url, headers=HEADERS)

    if response.status_code == 200:
        return response.json()
    else:
        print(f"Error getting PR #{pr_number}: {response.status_code}")
        return {}

def extract_release_notes(pr_body: str, target_ide: str) -> Optional[Tuple[Set[str], str]]:
    """
    Extract release notes from PR description.
    Returns a tuple of (affected_ides, notes_content) if found, None otherwise.
    """
    if not pr_body:
        return None

    # Find release notes section that starts at the beginning of a line
    release_notes_pattern = re.compile(r'(?:^|\n)## Release notes \[(.*?)\](.*?)(?:\n##|\Z)', re.DOTALL)
    match = release_notes_pattern.search(pr_body)

    if not match:
        return None

    # Extract IDEs and content
    ides_str = match.group(1).strip().lower()
    content = match.group(2).strip()

    # Remove HTML comments from content
    content = re.sub(r'<!--.*?-->', '', content, flags=re.DOTALL)
    content = re.sub(r'(\n\s*)+\n', '\n\n', content)

    # Parse IDEs
    affected_ides = {ide.strip() for ide in ides_str.split(',')}

    return (affected_ides, content)

def should_include_pr(affected_ides: Set[str], target_ide: str) -> bool:
    """Determine if a PR should be included in the release notes based on the IDE."""
    return (
        'all' in affected_ides or
        target_ide in affected_ides
    )

def generate_release_notes(from_branch: str, to_branch: str, target_ide: str) -> List[dict]:
    """Generate release notes for commits between the branches."""
    print(f"Generating release notes for {target_ide} between {from_branch} and {to_branch}...")

    release_notes = []
    commits = get_commits_between_branches(from_branch, to_branch)

    print(f"Found {len(commits)} commits between {from_branch} and {to_branch}")

    # Set to track processed PRs to avoid duplicates
    processed_prs = set()

    for commit in commits:
        pr_number = extract_pr_number_from_commit(commit)
        if not pr_number or pr_number in processed_prs:
            continue

        processed_prs.add(pr_number)
        pr_details = get_pr_details(pr_number)

        if not pr_details:
            continue

        pr_title = pr_details.get('title', '')
        pr_body = pr_details.get('body', '')

        release_notes_data = extract_release_notes(pr_body, target_ide)

        if release_notes_data:
            affected_ides, notes_content = release_notes_data
            if should_include_pr(affected_ides, target_ide):
                release_notes.append({
                    'pr_number': pr_number,
                    'pr_title': pr_title,
                    'notes_content': notes_content
                })
        else:
            # Include if no release notes section was found
            release_notes.append({
                'pr_number': pr_number,
                'pr_title': pr_title,
                'notes_content': ''
            })

    return release_notes

def format_release_notes(release_notes: List[dict]) -> str:
    """Format release notes as Markdown."""
    if not release_notes:
        return "No release notes found."

    markdown = f"# Release Notes\n\nGenerated on {datetime.now().strftime('%Y-%m-%d')}\n\n"

    for note in release_notes:
        pr_number = note['pr_number']
        pr_title = note['pr_title']
        notes_content = note['notes_content']

        markdown += f"## [{pr_title}](https://github.com/{GITHUB_REPO}/pull/{pr_number})\n\n"
        if notes_content:
            markdown += f"{notes_content}\n\n"

    return markdown

def main():
    parser = argparse.ArgumentParser(description='Generate release notes between two branches')
    parser.add_argument('--ide', choices=['vsc', 'jetbrains', 'visualstudio', 'all'],
                        help='Target IDE for release notes')
    args = parser.parse_args()

    # Fetch latest branches and tags
    fetch_latest_branches_and_tags()

    # Find latest release branch
    latest_branch = get_latest_release_branch()
    if not latest_branch:
        print("Error: No release branches found.")
        sys.exit(1)

    # Ask for current branch or use latest as default
    current_branch = input(f"Enter current release branch (default: {latest_branch}): ").strip()
    if not current_branch:
        current_branch = latest_branch

    # Find previous release branch
    default_previous = get_previous_release_branch(current_branch)
    if not default_previous:
        print(f"Warning: No previous release branch found before {current_branch}.")
        default_previous = input("Enter previous release branch: ").strip()
        if not default_previous:
            print("Error: Previous release branch is required.")
            sys.exit(1)
    else:
        previous_branch = input(f"Enter previous release branch (default: {default_previous}): ").strip()
        if not previous_branch:
            previous_branch = default_previous

    # Ask for target IDE if not provided as argument
    target_ide = args.ide
    if not target_ide:
        ide_options = ['vsc', 'jetbrains', 'visualstudio', 'all']
        print("Choose the target IDE:")
        for i, ide in enumerate(ide_options, 1):
            print(f"{i}. {ide}")

        choice = input("Enter your choice (1-4): ").strip()
        try:
            choice_idx = int(choice) - 1
            if 0 <= choice_idx < len(ide_options):
                target_ide = ide_options[choice_idx]
            else:
                print("Invalid choice. Using 'all' as default.")
                target_ide = 'all'
        except ValueError:
            print("Invalid input. Using 'all' as default.")
            target_ide = 'all'

    # Generate release notes
    release_notes = generate_release_notes(previous_branch, current_branch, target_ide)

    # Format and output release notes
    output = format_release_notes(release_notes)

    # Save to file
    output_file = f"release-notes-{current_branch}-{target_ide}.md"
    with open(output_file, 'w') as f:
        f.write(output)

    print(f"Release notes saved to {output_file}")

if __name__ == "__main__":
    main()
