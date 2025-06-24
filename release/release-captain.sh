#!/bin/bash

# Cody Release Captain CLI Workflow
# This script guides release captains through the Cody release process

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper function to print colored output
print_step() {
    echo -e "${BLUE}📋 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Helper function to confirm before proceeding
confirm() {
    read -p "$(echo -e "${YELLOW}❓ $1 (y/N): ${NC}")" -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
}

# Check prerequisites
check_prerequisites() {
    print_step "Checking prerequisites..."
    
    # Check if git is available
    if ! command -v git &> /dev/null; then
        print_error "git is required but not installed"
        exit 1
    fi
    
    # Check if gh CLI is available
    if ! command -v gh &> /dev/null; then
        print_error "GitHub CLI (gh) is required but not installed"
        exit 1
    fi
    
    # Check if jq is available
    if ! command -v jq &> /dev/null; then
        print_error "jq is required but not installed"
        exit 1
    fi
    
    # Check if we're in the right repo
    if [[ ! -f "package.json" ]] || ! grep -q "@sourcegraph/cody" package.json; then
        print_error "This script must be run from the root of the Cody repository"
        exit 1
    fi
    
    print_success "Prerequisites check passed"
}

# Get milestone from user
get_milestone() {
    if [[ -z "$MILESTONE" ]]; then
        read -p "$(echo -e "${BLUE}Enter milestone number (e.g., 66): ${NC}")" MILESTONE
        if [[ ! "$MILESTONE" =~ ^[0-9]+$ ]]; then
            print_error "Milestone must be a number"
            exit 1
        fi
    fi
    
    export MILESTONE
    export MILESTONE_MINUS_ONE=$((MILESTONE - 1))
    export MILESTONE_MINUS_TWO=$((MILESTONE - 2))
    
    print_success "Working on milestone $MILESTONE"
}

# Day 1: Create release branch
day1_create_branch() {
    print_step "DAY 1: Creating release branch for milestone $MILESTONE"
    
    confirm "Have you confirmed the branch date and version from the release calendar?"
    confirm "Has the previous release captain produced the stable VSCode release?"
    
    print_step "Fetching latest main and creating release branch..."
    git fetch origin main
    
    print_step "Latest commits on main:"
    git log --oneline FETCH_HEAD -5
    
    confirm "Proceed with creating release branch from the latest main commit?"
    
    # Create release branch
    git push origin FETCH_HEAD:refs/heads/M$MILESTONE
    print_success "Created release branch M$MILESTONE"
    
    # Create backport label
    gh label create "backport M$MILESTONE" --color "0366d6" --description "Backport to milestone $MILESTONE" || print_warning "Label may already exist"
    print_success "Created backport label"
    
    # Create prerelease builds
    print_step "Creating prerelease builds..."
    
    git tag jb-v7.${MILESTONE_MINUS_ONE}.0-nightly FETCH_HEAD
    git push origin tag jb-v7.${MILESTONE_MINUS_ONE}.0-nightly
    print_success "Created JetBrains nightly tag"
    
    gh workflow run release-vscode-prerelease --ref jb-v7.${MILESTONE_MINUS_ONE}.0-nightly
    print_success "Triggered VSCode prerelease workflow"
    
    print_step "Monitor workflow status with:"
    echo "  gh workflow view release-jetbrains-prerelease"
    echo "  gh workflow view release-vscode-prerelease"
    
    print_step "Collect VSCode Insiders version with:"
    echo "  git ls-remote | grep refs/tags/vscode-insiders-v1\\.$MILESTONE_MINUS_ONE\\."
    
    # Get the branch point commit for templates
    BRANCH_COMMIT=$(git rev-parse --short FETCH_HEAD)
    
    print_warning "Next steps - Copy and paste these messages:"
    
    echo
    echo "=== 1. Notify #team-cody-core ==="
    echo "Hey team! 👋 I'm the release captain for milestone $MILESTONE."
    echo
    echo "We've branched from commit $BRANCH_COMMIT for M$MILESTONE, which will produce:"
    echo "- VSCode v1.$MILESTONE.0"
    echo "- JetBrains v7.$MILESTONE.0"
    echo
    echo "**For ship-blocking fixes**: Add the \`backport M$MILESTONE\` label to your PRs."
    echo
    echo "**Prerelease versions for dogfooding**:"
    echo "- VSCode Insiders: v1.$MILESTONE_MINUS_ONE.{BUILD} (check: git ls-remote | grep vscode-insiders-v1\\\\.$MILESTONE_MINUS_ONE\\\\.)"
    echo "- JetBrains Nightly: v7.$MILESTONE_MINUS_ONE.0-nightly"
    echo
    echo "Please update your extensions and help us test! 🧪"
    echo
    echo "Next opportunity to reach stable: land code by {NEXT_BRANCH_DATE}, ships {NEXT_RELEASE_DATE}."
    echo
    echo "=== 2. Request QA (#ext-qa-fibilabs-sourcegraph) ==="
    echo "Hi QA team! 👋"
    echo
    echo "New prerelease builds are ready for testing:"
    echo "- **JetBrains**: v7.$MILESTONE_MINUS_ONE.0-nightly"
    echo "- **VSCode Insiders**: v1.$MILESTONE_MINUS_ONE.{BUILD} (get version from command above)"
    echo
    echo "Please QA these versions and report any issues. Thanks! 🙏"
    echo
    echo "=== 3. Introduce to Community Support (#discuss-community-support) ==="
    echo "Hi community support team! 👋"
    echo
    echo "I'm the release captain for Cody milestone $MILESTONE."
    echo
    echo "**Current prerelease versions**:"
    echo "- VSCode Insiders: v1.$MILESTONE_MINUS_ONE.{BUILD} (get version from command above)"
    echo "- JetBrains Nightly: v7.$MILESTONE_MINUS_ONE.0-nightly"
    echo
    echo "Please flag any issues you see with these versions - especially helpful since prerelease has fewer users. Thanks for the partnership! 🤝"
    echo
}

# Day 2-6: Stabilize release branch
day2_6_stabilize() {
    print_step "DAY 2-6: Stabilizing release branch M$MILESTONE"
    
    echo "Use this phase to:"
    echo "1. Monitor issues from QA, GitHub, community support"
    echo "2. Identify ship blockers"
    echo "3. Backport fixes using 'backport M$MILESTONE' label"
    echo "4. Cut new prerelease builds after backports"
    
    confirm "Create new prerelease builds now?"
    
    # Create new prerelease builds
    git fetch origin M$MILESTONE
    git checkout FETCH_HEAD
    
    # JetBrains
    cd jetbrains
    ./scripts/push-git-tag-for-next-release.sh --patch --nightly
    cd ..
    
    # VSCode
    gh workflow run release-vscode-prerelease --ref M$MILESTONE
    
    print_success "Created new prerelease builds"
    print_step "Monitor workflows and notify QA team to test"
}

# Day 7: Ship stable release
day7_ship_stable() {
    print_step "DAY 7: Shipping stable release for milestone $MILESTONE"
    
    confirm "Have you done a final check for ship blockers?"
    confirm "Are you ready to ship the stable release?"
    
    # Create release thread
    print_warning "Create a thread in #team-cody-core for this release"
    
    # Ship VSCode to stable
    print_step "Shipping VSCode to stable..."
    
    # Generate changelog
    print_step "Running changelog generation workflow..."
    confirm "Run the vscode-generate-changelog workflow on GitHub Actions?"
    
    echo "1. Go to: https://github.com/sourcegraph/cody/actions/workflows/generate-changelog.yml"
    echo "2. Click 'Run workflow'"
    echo "3. Select branch: M$MILESTONE"
    echo "4. Enter version: 1.$MILESTONE.0"
    echo "5. Review and merge the generated PR"
    
    confirm "Has the changelog PR been merged and backported to M$MILESTONE?"
    
    # Create VSCode stable release
    git fetch origin M$MILESTONE
    git checkout FETCH_HEAD
    
    VSCODE_VERSION=$(jq -r .version vscode/package.json)
    git tag vscode-v$VSCODE_VERSION
    git push origin tag vscode-v$VSCODE_VERSION
    print_success "Created VSCode stable tag: vscode-v$VSCODE_VERSION"
    
    print_step "Monitor VSCode stable release workflow"
    gh workflow view release-vscode-stable
    
    # Ship JetBrains to stable
    print_step "Shipping JetBrains to stable..."
    
    confirm "Do you have JDK installed and GITHUB_TOKEN exported?"
    
    git ls-remote | grep 'refs/tags/jb-v.*\..*\..*-nightly' | tail -5
    print_step "Latest nightly versions shown above"
    
    cd jetbrains
    ./scripts/push-git-tag-for-next-release.sh --minor --dry-run
    confirm "Does the dry-run look correct for v7.$MILESTONE.0?"
    
    ./scripts/push-git-tag-for-next-release.sh --minor
    gh workflow run release-jetbrains-stable --ref jb-v7.$MILESTONE.0
    cd ..
    
    print_success "Created JetBrains stable release"
    
    # Ship agent CLI
    print_step "Shipping agent CLI..."
    ./agent/scripts/minor-release.sh
    print_success "Created agent CLI release"
    
    # Ship Cody Web
    print_step "Ship Cody Web following: web/publish.md"
    
    print_warning "Manual steps remaining:"
    echo "1. Update JetBrains Marketplace (unhide stable version)"
    echo "2. Write JetBrains release notes on GitHub"
    echo "3. Monitor JetBrains Marketplace approval (up to 48 hours)"
    echo "4. Notify #team-cody-core when complete"
}

# Emergency patch release
emergency_patch() {
    print_step "EMERGENCY: Creating patch release"
    
    confirm "Are you sure you need an emergency patch release?"
    
    get_milestone
    
    print_step "Creating patch release for milestone $MILESTONE"
    
    # Determine patch version
    CURRENT_PATCH=$(git ls-remote | grep "refs/tags/vscode-v1\\.$MILESTONE\\." | wc -l)
    PATCH_VERSION=$((CURRENT_PATCH + 1))
    
    print_step "This will be patch version 1.$MILESTONE.$PATCH_VERSION"
    confirm "Proceed with patch release?"
    
    # Update VSCode version
    git checkout M$MILESTONE
    git pull origin M$MILESTONE
    
    # Update package.json version
    jq ".version = \"1.$MILESTONE.$PATCH_VERSION\"" vscode/package.json > tmp.json && mv tmp.json vscode/package.json
    
    git add vscode/package.json
    git commit -m "chore: bump version to 1.$MILESTONE.$PATCH_VERSION for patch release"
    git push origin M$MILESTONE
    
    # Create tags and release
    git tag vscode-v1.$MILESTONE.$PATCH_VERSION
    git push origin tag vscode-v1.$MILESTONE.$PATCH_VERSION
    
    # JetBrains patch
    cd jetbrains
    ./scripts/push-git-tag-for-next-release.sh --patch
    cd ..
    
    print_success "Emergency patch release created"
}

# Main menu
show_menu() {
    echo
    echo "=== Cody Release Captain CLI ==="
    echo "1. Day 1: Create release branch"
    echo "2. Day 2-6: Stabilize release branch (create new prerelease)"
    echo "3. Day 7: Ship stable release"
    echo "4. Emergency patch release"
    echo "5. Check prerequisites"
    echo "6. Exit"
    echo
}

# Main script
main() {
    check_prerequisites
    get_milestone
    
    while true; do
        show_menu
        read -p "$(echo -e "${BLUE}Select option (1-6): ${NC}")" choice
        case $choice in
            1)
                day1_create_branch
                ;;
            2)
                day2_6_stabilize
                ;;
            3)
                day7_ship_stable
                ;;
            4)
                emergency_patch
                ;;
            5)
                check_prerequisites
                ;;
            6)
                print_success "Goodbye! 🚀"
                exit 0
                ;;
            *)
                print_error "Invalid option. Please select 1-6."
                ;;
        esac
        
        echo
        read -p "$(echo -e "${YELLOW}Press Enter to continue...${NC}")"
    done
}

# Run if called directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
