# Cody Release Captain CLI

This directory contains automation scripts for Cody release captains.

## release-captain.sh

An interactive CLI workflow that follows the [Release Captain Playbook](https://www.notion.so/sourcegraph/Release-Captain-Playbook-13ba8e112658800d877ce7b4e8413935) and guides release captains through the complete Cody release process.

### Prerequisites

- Git CLI
- GitHub CLI (`gh`)
- `jq` for JSON processing
- Write access to the Cody repository
- JetBrains account with admin access (for JetBrains releases)
- `GITHUB_TOKEN` environment variable set

### Usage

```bash
./release/release-captain.sh
```

The script provides an interactive menu with these options:

1. **Day 1: Create release branch** - Creates release branch, backport labels, and prerelease builds
2. **Day 2-6: Stabilize release branch** - Helps create new prerelease builds after backports
3. **Day 7: Ship stable release** - Guides through stable release process for VSCode, JetBrains, and Agent
4. **Emergency patch release** - Creates emergency patch releases when needed
5. **Check prerequisites** - Validates required tools and permissions

### Environment Variables

- `MILESTONE` - The milestone number (e.g., 66). If not set, the script will prompt for it.

### Example

```bash
# Set milestone and run
export MILESTONE=66
./release/release-captain.sh
```

### Manual Steps Still Required

The script automates most tasks but still requires manual steps for:

- Reviewing and organizing generated changelogs
- JetBrains Marketplace management (unhiding releases, writing release notes)
- Community notifications and QA coordination
- Monitoring workflow statuses
- Final release verification

### Copy-Paste Templates

#### 1. Notify #team-cody-core (Day 1)

```text
Hey team! 👋 I'm the release captain for milestone {MILESTONE}.

We've branched from commit {COMMIT_HASH} for M{MILESTONE}, which will produce:
- VSCode v1.{MILESTONE}.0 
- JetBrains v7.{MILESTONE}.0

**For ship-blocking fixes**: Add the `backport M{MILESTONE}` label to your PRs.

**Prerelease versions for dogfooding**:
- VSCode Insiders: v1.{MILESTONE_MINUS_ONE}.{BUILD} 
- JetBrains Nightly: v7.{MILESTONE_MINUS_ONE}.0-nightly

Please update your extensions and help us test! 🧪

Next opportunity to reach stable: land code by {NEXT_BRANCH_DATE}, ships {NEXT_RELEASE_DATE}.
```

#### 2. Request QA (#ext-qa-fibilabs-sourcegraph)

```text
Hi QA team! 👋

New prerelease builds are ready for testing:
- **JetBrains**: v7.{MILESTONE_MINUS_ONE}.0-nightly
- **VSCode Insiders**: v1.{MILESTONE_MINUS_ONE}.{BUILD}

Please QA these versions and report any issues. Thanks! 🙏
```

#### 3. Introduce to Community Support (#discuss-community-support)

```text
Hi community support team! 👋

I'm the release captain for Cody milestone {MILESTONE}. 

**Current prerelease versions**:
- VSCode Insiders: v1.{MILESTONE_MINUS_ONE}.{BUILD}
- JetBrains Nightly: v7.{MILESTONE_MINUS_ONE}.0-nightly

Please flag any issues you see with these versions - especially helpful since prerelease has fewer users. Thanks for the partnership! 🤝
```

### Related Documentation

- Main release guide: See the comprehensive release captain guide in the codebase
- [Agent release guide](../agent/README.md#updating-the-polly-http-recordings)
- [Cody Web publishing guide](../web/publish.md)
Hello World
