#!/usr/bin/env node
import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import chalk from 'chalk'
import { Command } from 'commander'
import inquirer from 'inquirer'

// Define the release process stages
enum ReleaseStage {
    CREATE_BRANCH = 'create-branch',
    STABILIZE = 'stabilize',
    SHIP_STABLE = 'ship-stable',
    WRAP_UP = 'wrap-up',
}
// Define types for release completion
interface ReleaseCompletionStatus {
    completed: boolean
    timestamp: string
}

interface ReleaseCompletion {
    [stage: string]: ReleaseCompletionStatus
}

// Define choices for inquirer prompts
interface InquirerChoice {
    name: string
    value: string | ReleaseStage
    description?: string
}

// Define various prompt responses
interface MilestoneReleasePrompt {
    milestone: number
}

interface StageSelectionPrompt {
    stage: ReleaseStage
}

interface ConfirmationPrompt {
    [key: string]: boolean
}

interface TaskSelectionPrompt {
    selectedTask: string
}

interface ReleaseSelectionPrompt {
    selectedRelease: string
}

interface NextStagePrompt {
    nextStage: string | ReleaseStage
}

interface BackportPR {
    number: number
    title: string
    url: string
}

interface BuildTypePrompt {
    buildType: 'jetbrains' | 'vscode' | 'both'
}
interface ReleaseConfig {
    milestone: number
    branchPoint?: string
}

class ReleaseCaptain {
    private config: ReleaseConfig = {
        milestone: 0,
    }

    private dryRun = false

    constructor(private program: Command) {
        this.setupCommands()
    }

    private setupCommands(): void {
        this.program
            .name('release-captain')
            .description('Interactive CLI tool to help Cody release captains manage the release process')
            .version('1.0.0')
            .option('--dry-run', 'Run in dry run mode without executing real actions')

        this.program
            .command('start')
            .description('Start the release captain process')
            .action(() => {
                this.dryRun = !!this.program.opts().dryRun
                this.startReleaseProcess()
            })

        this.program
            .command('create-branch')
            .description('Create the release branch')
            .action(() => {
                this.dryRun = !!this.program.opts().dryRun
                this.createReleaseBranch()
            })

        this.program
            .command('stabilize')
            .description('Stabilize the release branch')
            .action(() => {
                this.dryRun = !!this.program.opts().dryRun
                this.stabilizeRelease()
            })

        this.program
            .command('ship')
            .description('Ship the stable release')
            .action(() => {
                this.dryRun = !!this.program.opts().dryRun
                this.shipStableRelease()
            })

        this.program
            .command('wrap-up')
            .description('Wrap up the release process')
            .action(() => {
                this.dryRun = !!this.program.opts().dryRun
                this.wrapUpRelease()
            })

        this.program
            .command('info')
            .description('Show information about the latest release')
            .action(() => {
                this.dryRun = !!this.program.opts().dryRun
                this.showReleaseInfo()
            })
    }

    private getLatestReleaseInfo(): { milestone: number; fullVersion: string; date: string } {
        try {
            // Try to get the latest VSCode release tag
            const tags = this.runCommand(
                'git ls-remote --tags origin | grep "refs/tags/vscode-v1."'
            ).trim()
            if (tags) {
                // Extract all version numbers (e.g., from vscode-v1.66.0 get the full version)
                const matches = tags.match(/vscode-v1\.\d+\.\d+/g)
                if (matches && matches.length > 0) {
                    // Sort in descending order and take the first one
                    const versions = matches
                        .map(tag => {
                            const parts = tag.match(/vscode-v1\.(\d+)\.(\d+)/)
                            if (parts) {
                                return {
                                    tag,
                                    major: Number.parseInt(parts[1], 10),
                                    minor: Number.parseInt(parts[2], 10),
                                    sortKey:
                                        Number.parseInt(parts[1], 10) * 1000 +
                                        Number.parseInt(parts[2], 10),
                                }
                            }
                            return null
                        })
                        .filter(v => v !== null) as Array<{
                        tag: string
                        major: number
                        minor: number
                        sortKey: number
                    }>

                    // Sort by milestone and patch version
                    versions.sort((a, b) => b.sortKey - a.sortKey)

                    if (versions.length > 0) {
                        const latest = versions[0]

                        // Get the date of the latest release tag
                        let releaseDate = 'unknown'
                        try {
                            // Format: 2023-01-25
                            const dateOutput = this.runCommand(
                                `git log -1 --format=%ad --date=short refs/tags/${latest.tag}`
                            ).trim()
                            if (dateOutput) {
                                releaseDate = dateOutput
                            }
                        } catch (error) {
                            console.error(chalk.yellow('Could not determine release date'), error)
                        }

                        return {
                            milestone: latest.major,
                            fullVersion: `${latest.major}.${latest.minor}`,
                            date: releaseDate,
                        }
                    }
                }
            }
            return { milestone: 0, fullVersion: '0.0', date: 'unknown' }
        } catch (error) {
            console.error(chalk.yellow('Could not determine latest release version'), error)
            return { milestone: 0, fullVersion: '0.0', date: 'unknown' }
        }
    }

    private async startReleaseProcess(): Promise<void> {
        console.log(chalk.blue('🚢 Welcome to the Cody Release Captain CLI'))
        console.log(chalk.yellow('This tool will guide you through the release process step by step.'))

        if (this.dryRun) {
            console.log(chalk.magenta('🧪 DRY RUN MODE: No GitHub actions will be triggered'))
        }

        // Get the latest release version to show in the prompt
        const latestRelease = this.getLatestReleaseInfo()
        const milestoneMessage = latestRelease.milestone
            ? `What is the milestone number for this release? (latest release: M${
                  latestRelease.milestone
              }.${latestRelease.fullVersion.split('.')[1]}, released on ${latestRelease.date})`
            : 'What is the milestone number for this release? (e.g., 66)'

        const { milestone } = await inquirer.prompt([
            {
                type: 'number',
                name: 'milestone',
                message: milestoneMessage,
                validate: (value: number) => {
                    if (Number.isNaN(value) || value <= 0) {
                        return 'Please enter a valid milestone number'
                    }
                    if (latestRelease.milestone > 0 && value < latestRelease.milestone) {
                        return `The milestone number must be greater than or equal to the latest release (M${latestRelease.milestone})`
                    }
                    return true
                },
            },
        ])

        this.config.milestone = milestone

        this.saveConfig()

        const { stage } = await inquirer.prompt([
            {
                type: 'list',
                name: 'stage',
                message: 'Which stage of the release process would you like to start with?',
                choices: [
                    { name: 'Create release branch (Day 1)', value: ReleaseStage.CREATE_BRANCH },
                    { name: 'Stabilize release branch (Days 2-6)', value: ReleaseStage.STABILIZE },
                    { name: 'Ship stable release (Day 7)', value: ReleaseStage.SHIP_STABLE },
                    { name: 'Wrap up the release', value: ReleaseStage.WRAP_UP },
                ],
            },
        ])

        switch (stage) {
            case ReleaseStage.CREATE_BRANCH:
                await this.createReleaseBranch()
                break
            case ReleaseStage.STABILIZE:
                await this.stabilizeRelease()
                break
            case ReleaseStage.SHIP_STABLE:
                await this.shipStableRelease()
                break
            case ReleaseStage.WRAP_UP:
                await this.wrapUpRelease()
                break
        }
    }

    private async createReleaseBranch(): Promise<void> {
        if (!this.loadConfig()) {
            this.config = await this.promptForConfig()
        }

        console.log(chalk.blue('📦 Creating Release Branch - Day 1'))
        console.log(chalk.yellow(`Release milestone: M${this.config.milestone}`))

        // Check if previous release captain has produced stable VSCode release
        const { prevReleaseConfirmed } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'prevReleaseConfirmed',
                message: 'Has the previous release captain produced the stable VSCode release?',
                default: false,
            },
        ])

        if (!prevReleaseConfirmed) {
            console.log(
                chalk.red(
                    '⚠️ You should wait for the previous release captain to complete their stable release.'
                )
            )
            console.log(chalk.yellow('This is important because of VSCode Marketplace requirements.'))

            const { proceed } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'proceed',
                    message: 'Do you still want to proceed?',
                    default: false,
                },
            ])

            if (!proceed) {
                console.log(
                    chalk.blue(
                        'Process aborted. Run again when previous release captain has completed their work.'
                    )
                )
                return
            }
        }

        // Create next release branches and backport labels
        console.log(chalk.green('Creating next release branches and backport labels...'))

        try {
            console.log('Fetching latest main branch...')
            this.runCommand('git fetch origin main')

            console.log('Getting the latest commit on main...')
            const branchPoint = this.runCommand('git log --oneline FETCH_HEAD -n 1').split(' ')[0]

            this.config.branchPoint = branchPoint
            this.saveConfig()

            console.log(`Branch point commit: ${chalk.green(branchPoint)}`)

            const { confirmBranchCreation } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'confirmBranchCreation',
                    message: `Ready to create branch M${this.config.milestone} from commit ${branchPoint}?`,
                    default: true,
                },
            ])

            if (confirmBranchCreation) {
                console.log(`Creating branch M${this.config.milestone}...`)
                this.runCommand(`git push origin FETCH_HEAD:refs/heads/M${this.config.milestone}`)

                console.log(`Creating backport label "backport M${this.config.milestone}"...`)
                this.runCommand(`gh label create "backport M${this.config.milestone}"`)
            }
        } catch (error) {
            console.error(chalk.red('Error creating branch:'), error)
            return
        }

        // Create prerelease builds
        const { createPrerelease } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'createPrerelease',
                message: 'Do you want to create prerelease builds now?',
                default: true,
            },
        ])

        if (createPrerelease) {
            const milestoneMinus = this.config.milestone - 1

            try {
                console.log('Creating JetBrains nightly tag...')
                this.runCommand(`git tag jb-v7.${milestoneMinus}.0-nightly FETCH_HEAD`)
                this.runCommand(`git push origin tag jb-v7.${milestoneMinus}.0-nightly`)

                console.log('Triggering VSCode prerelease workflow...')
                const command = `gh workflow run release-vscode-prerelease --ref jb-v7.${milestoneMinus}.0-nightly`
                this.runCommand(command)

                console.log(chalk.green('Prerelease builds are being created.'))
                console.log(chalk.yellow('You can monitor the workflow status with these commands:'))
                console.log('  gh workflow view release-jetbrains-prerelease')
                console.log('  gh workflow view release-vscode-prerelease')

                console.log(
                    chalk.yellow('\nOnce workflows complete, collect the VSCode Insiders version with:')
                )
                console.log(`  git ls-remote | grep refs/tags/vscode-insiders-v1\\.${milestoneMinus}\\.`)
            } catch (error) {
                console.error(chalk.red('Error creating prerelease builds:'), error)
            }
        }

        // Notify teams
        console.log(chalk.blue('\n📣 Next Steps:'))
        console.log(chalk.yellow('1. Notify the Cody Core team in #team-cody-core about:'))
        console.log(
            `   - Release versions (M${this.config.milestone})`
        )
        console.log(`   - Branch point (${this.config.branchPoint})`)
        console.log('   - Remind team members about deadlines and dogfooding')

        console.log(chalk.yellow('\n2. Start the QA process:'))
        console.log('   - Notify #ext-qa-fibilabs-sourcegraph to QA the prerelease versions')

        console.log(chalk.yellow('\n3. Introduce yourself to community support:'))
        console.log("   - Notify #discuss-community-support that you're the release captain")

        // Record completion
        this.saveCompletionStatus(ReleaseStage.CREATE_BRANCH)

        const { nextStage } = await inquirer.prompt([
            {
                type: 'list',
                name: 'nextStage',
                message: 'What would you like to do next?',
                choices: [
                    { name: 'Continue to stabilize release branch', value: ReleaseStage.STABILIZE },
                    { name: 'Exit', value: 'exit' },
                ],
            },
        ])

        if (nextStage === ReleaseStage.STABILIZE) {
            await this.stabilizeRelease()
        }
    }

    private async stabilizeRelease(): Promise<void> {
        if (!this.loadConfig()) {
            this.config = await this.promptForConfig()
        }

        console.log(chalk.blue('🛠️ Stabilizing Release Branch - Days 2-6'))
        console.log(chalk.yellow(`Release milestone: M${this.config.milestone}`))

        const stabilizationTasks = [
            {
                name: 'Review QA reports',
                value: 'qa_reports',
                description: 'Check QA reports from FibiLabs team for new bugs',
            },
            {
                name: 'Check GitHub Issues',
                value: 'github_issues',
                description:
                    'Review issues reported in sourcegraph/cody and sourcegraph/jetbrains repos',
            },
            {
                name: 'Check community support',
                value: 'community_support',
                description: 'Review issues reported in #discuss-community-support',
            },
            {
                name: 'Check backport PRs',
                value: 'backport_prs',
                description: 'Review PRs with the backport label',
            },
            {
                name: 'Create new prerelease build',
                value: 'new_prerelease',
                description: 'Create a new prerelease build after applying backports',
            },
        ]

        const { selectedTask } = await inquirer.prompt([
            {
                type: 'list',
                name: 'selectedTask',
                message: 'What stabilization task would you like to perform?',
                choices: [
                    ...stabilizationTasks,
                    { name: 'Continue to ship stable release', value: 'continue' },
                    { name: 'Exit', value: 'exit' },
                ],
            },
        ])

        if (selectedTask === 'exit') {
            return
        }

        if (selectedTask === 'continue') {
            this.saveCompletionStatus(ReleaseStage.STABILIZE)
            await this.shipStableRelease()
            return
        }

        switch (selectedTask) {
            case 'qa_reports':
                console.log(chalk.yellow('📋 Checking QA Reports'))
                console.log(
                    'QA reports can be found at: https://linear.app/sourcegraph/view/qa-reports-a3ad1b3be751'
                )
                break

            case 'github_issues':
                console.log(chalk.yellow('🐛 Checking GitHub Issues'))
                console.log('Check these repositories for issues:')
                console.log('- https://github.com/sourcegraph/cody/issues')
                console.log('- https://github.com/sourcegraph/jetbrains/issues')

                console.log(chalk.blue('\nSearch tips:'))
                console.log('- Search for your prerelease versions specifically')
                console.log('- Use `gh issue list` and `grep` for better filtering')
                break

            case 'community_support':
                console.log(chalk.yellow('👥 Checking Community Support'))
                console.log('Check #discuss-community-support for reported issues')
                console.log('Pay special attention to issues with your prerelease build')
                break

            case 'backport_prs':
                console.log(chalk.yellow('🔙 Checking Backport PRs'))
                console.log(`Running: gh pr list --label "backport M${this.config.milestone}"`)

                try {
                    const backportPRs = this.runCommand(
                        `gh pr list --label "backport M${this.config.milestone}" --json number,title,url`
                    )
                    console.log('Backport PRs:')
                    console.log(backportPRs)
                } catch (error) {
                    console.error(chalk.red('Error checking backport PRs:'), error)
                }
                break

            case 'new_prerelease':
                await this.createNewPrerelease()
                break
        }

        // Return to stabilization menu
        await this.stabilizeRelease()
    }

    private async createNewPrerelease(): Promise<void> {
        console.log(chalk.yellow('🔄 Creating New Prerelease Build'))

        try {
            console.log(`Fetching latest M${this.config.milestone} branch...`)
            this.runCommand(`git fetch origin M${this.config.milestone}`)
            this.runCommand('git checkout FETCH_HEAD')

            const { buildType } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'buildType',
                    message: 'Which prerelease build do you want to create?',
                    choices: [
                        { name: 'JetBrains', value: 'jetbrains' },
                        { name: 'VSCode', value: 'vscode' },
                        { name: 'Both', value: 'both' },
                    ],
                },
            ])

            if (buildType === 'jetbrains' || buildType === 'both') {
                console.log('Creating JetBrains nightly build...')
                this.runCommand(
                    'cd jetbrains && ./scripts/push-git-tag-for-next-release.sh --patch --nightly'
                )
            }

            if (buildType === 'vscode' || buildType === 'both') {
                console.log('Creating VSCode prerelease build...')
                const command = `gh workflow run release-vscode-prerelease --ref M${this.config.milestone}`
                this.runCommand(command)
            }

            console.log(chalk.green('Prerelease builds are being created.'))
            console.log(chalk.yellow('You can monitor the workflow status with these commands:'))
            console.log('  gh workflow view release-jetbrains-prerelease')
            console.log('  gh workflow view release-vscode-prerelease')

            console.log(chalk.blue('\n📣 Next Steps:'))
            console.log(chalk.yellow('- Notify QA team to test the new prerelease build'))
        } catch (error) {
            console.error(chalk.red('Error creating prerelease builds:'), error)
        }
    }

    private async shipStableRelease(): Promise<void> {
        if (!this.loadConfig()) {
            this.config = await this.promptForConfig()
        }

        console.log(chalk.blue('🚢 Shipping Stable Release - Day 7'))
        console.log(chalk.yellow(`Release milestone: M${this.config.milestone}`))

        console.log(chalk.yellow('Before proceeding, perform these checks:'))
        console.log('1. Create a thread in #team-cody-core for shipping this release')
        console.log('2. Do a final check for problems (same as days 2-6)')
        console.log('3. If ship blockers exist, consult with EM, TL and team')

        const { noShipBlockers } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'noShipBlockers',
                message: 'Have you confirmed there are no ship blockers?',
                default: false,
            },
        ])

        if (!noShipBlockers) {
            console.log(
                chalk.red('⛔ Do not proceed with the release until ship blockers are resolved.')
            )
            return
        }

        const releaseOptions = [
            {
                name: 'Ship VSCode to Stable',
                value: 'vscode_stable',
            },
            {
                name: 'Ship JetBrains to Stable',
                value: 'jetbrains_stable',
            },
            {
                name: 'Ship agent CLI release',
                value: 'agent_cli',
            },
            {
                name: 'Ship Cody Web to Sourcegraph',
                value: 'cody_web',
            },
        ]

        const { selectedRelease } = await inquirer.prompt([
            {
                type: 'list',
                name: 'selectedRelease',
                message: 'What would you like to release?',
                choices: [
                    ...releaseOptions,
                    { name: 'Continue to wrap up', value: 'continue' },
                    { name: 'Exit', value: 'exit' },
                ],
            },
        ])

        if (selectedRelease === 'exit') {
            return
        }

        if (selectedRelease === 'continue') {
            this.saveCompletionStatus(ReleaseStage.SHIP_STABLE)
            await this.wrapUpRelease()
            return
        }

        switch (selectedRelease) {
            case 'vscode_stable':
                await this.shipVSCodeStable()
                break

            case 'jetbrains_stable':
                await this.shipJetBrainsStable()
                break

            case 'agent_cli':
                await this.shipAgentCLI()
                break

            case 'cody_web':
                await this.shipCodyWeb()
                break
        }

        // Return to ship stable menu
        await this.shipStableRelease()
    }

    private async shipVSCodeStable(): Promise<void> {
        console.log(chalk.yellow('📦 Shipping VSCode to Stable'))

        const { useAutomation } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'useAutomation',
                message: 'Do you want to use the automated changelog generation workflow?',
                default: true,
            },
        ])

        if (useAutomation) {
            console.log(chalk.green('Running the vscode-generate-changelog workflow:'))
            console.log(
                '1. Go to: https://github.com/sourcegraph/cody/actions/workflows/generate-changelog.yml'
            )
            console.log(`2. Click "Run workflow" and select the M${this.config.milestone} branch`)
            console.log(`3. Fill in version number 1.${this.config.milestone}.0`)

            const { changelogPRCreated } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'changelogPRCreated',
                    message: 'Has the changelog PR been created and merged?',
                    default: false,
                },
            ])

            if (!changelogPRCreated) {
                console.log(chalk.yellow('Please complete the changelog PR before continuing.'))
                return
            }
        } else {
            console.log(chalk.yellow('Follow the manual steps for changelog generation:'))
            console.log('1. Create a changelog branch')
            console.log('2. Update package.json version')
            console.log('3. Generate and organize changelog')
            console.log('4. Create PR with backport label')

            const { changelogPRCreated } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'changelogPRCreated',
                    message: 'Has the changelog PR been created and merged?',
                    default: false,
                },
            ])

            if (!changelogPRCreated) {
                console.log(chalk.yellow('Please complete the changelog PR before continuing.'))
                return
            }
        }

        // Create VSCode stable release
        console.log(chalk.green('Creating VSCode stable release:'))

        const { confirmVSCodeRelease } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirmVSCodeRelease',
                message: 'Are you ready to create the VSCode stable release?',
                default: false,
            },
        ])

        if (confirmVSCodeRelease) {
            try {
                console.log('Fetching the latest release branch...')
                this.runCommand(`git fetch origin M${this.config.milestone}`)
                this.runCommand('git checkout FETCH_HEAD')

                console.log('Creating and pushing tag...')
                this.runCommand('git tag vscode-v$(jq -r .version vscode/package.json)')
                this.runCommand('git push origin tag vscode-v$(jq -r .version vscode/package.json)')

                console.log(chalk.green('VSCode stable release tag created.'))
                console.log(
                    chalk.yellow(
                        'Monitor the workflow at: https://github.com/sourcegraph/cody/actions/workflows/vscode-stable-release.yml'
                    )
                )
            } catch (error) {
                console.error(chalk.red('Error creating VSCode stable release:'), error)
            }
        }
    }

    private async shipJetBrainsStable(): Promise<void> {
        console.log(chalk.yellow('📦 Shipping JetBrains to Stable'))

        // Pre-requisites check
        console.log(chalk.yellow('Prerequisites:'))
        console.log(
            '- JDK installation (see https://github.com/sourcegraph/cody/blob/main/jetbrains/CONTRIBUTING.md)'
        )
        console.log('- GITHUB_TOKEN exported in your shell')

        const { prerequisitesMet } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'prerequisitesMet',
                message: 'Have you met all prerequisites?',
                default: false,
            },
        ])

        if (!prerequisitesMet) {
            console.log(chalk.red('Please meet all prerequisites before continuing.'))
            return
        }

        // Find latest nightly version
        console.log('Finding latest nightly version...')
        try {
            const nightlyTags = this.runCommand(
                `git ls-remote | grep 'refs/tags/jb-v.*\\..*\\..*-nightly'`
            )
            console.log('Latest nightly tags:')
            console.log(nightlyTags)
        } catch (error) {
            console.error(chalk.red('Error finding nightly versions:'), error)
        }

        // Create stable version
        const { confirmJetBrainsRelease } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirmJetBrainsRelease',
                message: 'Are you ready to create the JetBrains stable release?',
                default: false,
            },
        ])

        if (confirmJetBrainsRelease) {
            try {
                console.log(`Fetching the latest M${this.config.milestone} branch...`)
                this.runCommand(`git fetch origin M${this.config.milestone}`)
                this.runCommand('git checkout FETCH_HEAD')

                console.log('Creating JetBrains stable version...')
                this.runCommand(
                    'cd jetbrains && ./scripts/push-git-tag-for-next-release.sh --minor --dry-run'
                )

                const { proceedWithRelease } = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'proceedWithRelease',
                        message:
                            'Does the dry run look correct? Ready to proceed with the real release?',
                        default: false,
                    },
                ])

                if (proceedWithRelease) {
                    this.runCommand('cd jetbrains && ./scripts/push-git-tag-for-next-release.sh --minor')
                    const workflowCommand = `gh workflow run release-jetbrains-stable --ref jb-v7.${this.config.milestone}.0`
                    this.runCommand(workflowCommand)

                    console.log(chalk.green('JetBrains stable release is being created.'))
                    console.log(
                        chalk.yellow(
                            'Monitor the workflow at: https://github.com/sourcegraph/cody/actions/workflows/release-jetbrains-stable.yml'
                        )
                    )

                    console.log(chalk.blue('\n📣 Next Steps:'))
                    console.log('1. Go to JetBrains Marketplace, Versions and unhide the stable version')
                    console.log('2. Write release notes on GitHub')
                    console.log('3. Monitor for approval from JetBrains Marketplace')
                }
            } catch (error) {
                console.error(chalk.red('Error creating JetBrains stable release:'), error)
            }
        }
    }

    private async shipAgentCLI(): Promise<void> {
        console.log(chalk.yellow('📦 Shipping agent CLI release'))

        const { confirmAgentRelease } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirmAgentRelease',
                message: 'Are you ready to create the agent CLI release?',
                default: false,
            },
        ])

        if (confirmAgentRelease) {
            try {
                console.log('Running agent release script...')
                this.runCommand('./agent/scripts/minor-release.sh')

                console.log(chalk.green('Agent CLI release script executed.'))
                console.log(
                    chalk.yellow(
                        'Monitor the workflow at: https://github.com/sourcegraph/cody/actions/workflows/agent-release.yml'
                    )
                )
            } catch (error) {
                console.error(chalk.red('Error creating agent CLI release:'), error)
                console.log(chalk.yellow('You may need to run the steps from the script manually.'))
            }
        }
    }

    private async shipCodyWeb(): Promise<void> {
        console.log(chalk.yellow('📦 Shipping Cody Web to Sourcegraph'))

        console.log('Follow the Cody Web publishing guide:')
        console.log(
            'https://sourcegraph.sourcegraph.com/github.com/sourcegraph/cody/-/blob/web/publish.md'
        )

        console.log(
            chalk.blue(
                '\nRefer to the detailed steps in the guide for releasing Cody Web from the stable release branch.'
            )
        )
    }

    private async wrapUpRelease(): Promise<void> {
        if (!this.loadConfig()) {
            this.config = await this.promptForConfig()
        }

        console.log(chalk.blue('🎉 Wrapping Up Release'))
        console.log(chalk.yellow(`Release milestone: M${this.config.milestone}`))

        console.log(chalk.green('Final steps:'))
        console.log('1. Send a message to the release thread in #team-cody-core')
        console.log('   - Let them know VSCode stable release is done')
        console.log('   - JetBrains release is waiting for Marketplace approval')
        console.log('2. Be available for emergency backports if needed')

        console.log(chalk.blue('\nSuggestions for improvement:'))
        console.log('Add ideas to the Cody extension release improvements project in Linear:')
        console.log(
            'https://linear.app/sourcegraph/project/cody-extension-release-improvements-4adca5f5d51b/overview'
        )

        this.saveCompletionStatus(ReleaseStage.WRAP_UP)

        console.log(chalk.green('\n🎉 Congratulations! You have completed the release process.'))
        console.log(
            chalk.yellow(
                'Remember to check that JetBrains approves the stable release and it appears in JetBrains Marketplace.'
            )
        )
    }

    private async showReleaseInfo(): Promise<void> {
        const latestRelease = this.getLatestReleaseInfo()

        if (latestRelease.milestone === 0) {
            console.log(chalk.yellow('⚠️ Could not find any release information.'))
            return
        }

        console.log(chalk.blue('📊 Latest Release Information'))
        console.log(chalk.green('Milestone:'), `M${latestRelease.milestone}`)
        console.log(chalk.green('Version:'), `v1.${latestRelease.fullVersion}`)
        console.log(chalk.green('Release date:'), latestRelease.date)

        // Calculate days since release
        try {
            const releaseDate = new Date(latestRelease.date)
            const today = new Date()
            const diffTime = Math.abs(today.getTime() - releaseDate.getTime())
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

            console.log(chalk.green('Days since release:'), diffDays)
        } catch (error) {
            // If date parsing fails, just skip this calculation
        }

        // Check for pre-release tags since last stable
        try {
            const prereleaseTags = this.runCommand(
                `git tag --list "vscode-insiders-v1.${latestRelease.milestone}*"`
            ).trim()
            if (prereleaseTags) {
                console.log(chalk.green('\nPre-release versions since last stable:'))
                console.log(prereleaseTags)
            }
        } catch (error) {
            // If command fails, just skip this section
        }
    }

    private async promptForConfig(): Promise<ReleaseConfig> {
        // Get the latest release version to show in the prompt
        const latestRelease = this.getLatestReleaseInfo()
        const milestoneMessage = latestRelease.milestone
            ? `What is the milestone number for this release? (latest release: M${
                  latestRelease.milestone
              }.${latestRelease.fullVersion.split('.')[1]}, released on ${latestRelease.date})`
            : 'What is the milestone number for this release? (e.g., 66)'

        const { milestone } = await inquirer.prompt([
            {
                type: 'number',
                name: 'milestone',
                message: milestoneMessage,
                validate: (value: number) => {
                    if (Number.isNaN(value) || value <= 0) {
                        return 'Please enter a valid milestone number'
                    }
                    if (latestRelease.milestone > 0 && value < latestRelease.milestone) {
                        return `The milestone number must be greater than or equal to the latest release (M${latestRelease.milestone})`
                    }
                    return true
                },
            },
        ])

        return {
            milestone,
        }
    }

    private getConfigPath(): string {
        return path.join(process.cwd(), '.release-captain-config.json')
    }

    private getCompletionPath(): string {
        return path.join(process.cwd(), '.release-captain-completion.json')
    }

    private saveConfig(): void {
        try {
            fs.writeFileSync(this.getConfigPath(), JSON.stringify(this.config, null, 2))
        } catch (error) {
            console.error(chalk.red('Error saving config:'), error)
        }
    }

    private loadConfig(): boolean {
        try {
            if (fs.existsSync(this.getConfigPath())) {
                this.config = JSON.parse(fs.readFileSync(this.getConfigPath(), 'utf8'))
                return true
            }
        } catch (error) {
            console.error(chalk.red('Error loading config:'), error)
        }
        return false
    }

    private saveCompletionStatus(stage: ReleaseStage): void {
        try {
            const completionPath = this.getCompletionPath()
            let completion: ReleaseCompletion = {}

            if (fs.existsSync(completionPath)) {
                completion = JSON.parse(fs.readFileSync(completionPath, 'utf8'))
            }

            completion[stage] = {
                completed: true,
                timestamp: new Date().toISOString(),
            }

            fs.writeFileSync(completionPath, JSON.stringify(completion, null, 2))
        } catch (error) {
            console.error(chalk.red('Error saving completion status:'), error)
        }
    }

    private runCommand(command: string): string {
        try {
            if (this.dryRun && (command.includes('git push') || command.includes('gh workflow run'))) {
                console.log(chalk.magenta(`[DRY RUN] Would execute: ${command}`))
                return '[DRY RUN OUTPUT]'
            }
            return execSync(command, { encoding: 'utf8' })
        } catch (error) {
            console.error(`Error executing command: ${command}`)
            throw error
        }
    }
}

// Run the CLI
const program = new Command()
const releaseCaptain = new ReleaseCaptain(program)
program.parse(process.argv)

// If no command is provided, show help
if (process.argv.length <= 2) {
    program.help()
}
