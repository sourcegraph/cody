import * as path from 'path'
import * as fspromises from 'fs/promises'

import * as commander from 'commander'
import * as vscode from 'vscode'

import { newAgentClient } from '../../agent'

import { arrayOption, booleanOption, intOption } from './cli-parsers'
import { matchesGlobPatterns } from './matchesGlobPatterns'
import { evaluateBfgStrategy } from './strategy-bfg'
import { evaluateGitLogStrategy } from './strategy-git-log'

export interface EvaluateAutocompleteOptions {
    workspace: string
    worktree?: string
    treeSitterGrammars: string
    queriesDirectory: string
    testCount: number
    maxFileTestCount: number
    includeFixture: string[]
    excludeFixture: string[]
    includeWorkspace: string[]
    excludeWorkspace: string[]
    includeFilepath?: string[]
    excludeFilepath?: string[]
    includeLanguage?: string[]
    excludeLanguage?: string[]
    includeMatchKind?: string[]
    excludeMatchKind?: string[]
    testTypecheck?: boolean
    testParse?: boolean
    srcAccessToken: string
    srcEndpoint: string

    codyAgentBinary?: string

    matchMinimumSize?: number
    matchSkipSingleline?: number
    matchEveryN?: number
    matchKindDistribution?: number

    evaluationConfig: string
    snapshotDirectory: string
    csvPath?: string
    bfgBinary?: string
    installCommand?: string
    testCommand?: string
    gitLogFilter?: string
    fixture: EvaluationFixture
}

interface EvaluationConfig extends Partial<EvaluateAutocompleteOptions> {
    workspaces: EvaluateAutocompleteOptions[]
    fixtures?: EvaluationFixture[]
}

enum EvaluationStrategy {
    BFG = 'bfg',
    GitLog = 'git-log',
}

interface EvaluationFixture {
    name: string
    customConfiguration?: Record<string, any>
    strategy: EvaluationStrategy
    codyAgentBinary?: string
}

async function loadEvaluationConfig(
    options: EvaluateAutocompleteOptions
): Promise<EvaluateAutocompleteOptions[]> {
    if (!options?.evaluationConfig) {
        return [options]
    }
    const configBuffer = await fspromises.readFile(options.evaluationConfig)
    const config = JSON.parse(configBuffer.toString()) as EvaluationConfig
    const result: EvaluateAutocompleteOptions[] = []
    for (const test of config?.workspaces ?? []) {
        if (!test.workspace) {
            console.error(
                `skipping test, missing required property 'workspace': ${JSON.stringify(test)}`
            )
            continue
        }
        const rootDir = path.dirname(options.evaluationConfig)
        const workspace = path.normalize(path.join(rootDir, test.workspace))
        const fixtures: EvaluationFixture[] = config.fixtures ?? [
            { name: 'default', strategy: EvaluationStrategy.BFG },
        ]
        for (const fixture of fixtures) {
            if (!fixture.strategy) {
                throw new Error(`missing: fixture.strategy: ${JSON.stringify(fixture)}`)
            }
            const snapshotDirectory = test.snapshotDirectory
                ? path.join(rootDir, test.snapshotDirectory, fixture.name, test.workspace)
                : config.snapshotDirectory
                  ? path.join(rootDir, config.snapshotDirectory, fixture.name, test.workspace)
                  : options.snapshotDirectory

            const codyAgentBinary = fixture.codyAgentBinary
                ? path.resolve(path.dirname(options.evaluationConfig), fixture.codyAgentBinary)
                : undefined
            result.push({
                ...options,
                ...config,
                ...test,
                queriesDirectory: options?.queriesDirectory,
                workspace,
                snapshotDirectory,
                codyAgentBinary,
                fixture,
                csvPath: path.join(snapshotDirectory, 'autocomplete.csv'),
            })
        }
    }

    return result
}

export const evaluateAutocompleteCommand = new commander.Command('evaluate-autocomplete')
    .description('Evaluate Cody autocomplete by running the Agent in headless mode')
    .option(
        '--workspace <path>',
        'The workspace directory where to run the autocomplete evaluation',
        process.cwd()
    )
    .option(
        '--test-count <number>',
        'The number of autocomplete requests to run in this evaluation',
        intOption
    )
    .option(
        '--max-file-test-count <number>',
        'The maximum number of autocomplete requests to evaluate in a single document',
        intOption,
        // relatively safe to use large number because we spread usages
        // across different autocomplete kinds
        100
    )
    .option('--evaluation-config <path>', 'Path to a JSON with configuration for this evaluation', '')
    .option(
        '--snapshot-directory <path>',
        'Directory where to write snapshot files to document autocomplete results',
        ''
    )
    .option(
        '--include-match-kind <kind>',
        'Glob to determine what kinds of matches to trigger autocomplete against.',
        arrayOption as any,
        []
    )
    .option(
        '--exclude-match-kind <kind>',
        'Glob to determine what kinds of matches to not trigger autocomplete against.',
        arrayOption as any,
        []
    )
    .option('--match-skip-singleline <bool>', 'Whether to skip single line ranges', booleanOption, false)
    .option(
        '--match-minimum-size <number>',
        'Minimum size of a match to trigger an autocomplete',
        intOption,
        20
    )
    .option(
        '--match-every-n <number>',
        'Only trigger autocomplete in every N-th match. The motivation to do this is a to get a wider spread of matches. ' +
            'Sometimes, the same code pattern repeats multiple times and eats up the limit for the file. ' +
            ' By skipping every few matches, there is a bigger chance that we will hit requests further down in the file before hitting the file request limit.',
        intOption,
        1
    )
    .option(
        '--match-kind-distribution <number>',
        "Don't allow a bigger gap than X between the autocomplete kind with most triggers and least triggers. " +
            'Sometimes, the same code pattern repeats multiple times and eats up the limit for the file. ' +
            ' By skipping every few matches, there is a bigger chance that we will hit requests further down in the file before hitting the file request limit.',
        intOption,
        1.4
    )
    .addOption(
        new commander.Option(
            '--src-access-token <token>',
            'The Sourcegraph access token to use for authentication'
        ).env('SRC_ACCESS_TOKEN')
    )
    .addOption(
        new commander.Option(
            '--src-endpoint <url>',
            'The Sourcegraph URL endpoint to use for authentication'
        ).env('SRC_ENDPOINT')
    )
    .option(
        '--include-workspace <glob>',
        'A glob pattern to determine what workspace paths to include in the evaluation',
        arrayOption as any,
        []
    )
    .option(
        '--exclude-workspace <glob>',
        'A glob pattern to determine what workspace paths to exclude in the evaluation',
        arrayOption as any,
        []
    )
    .option(
        '--include-language <glob>',
        'A glob pattern to determine what language paths to include in the evaluation',
        arrayOption as any,
        []
    )
    .option(
        '--exclude-language <glob>',
        'A glob pattern to determine what language paths to exclude in the evaluation',
        arrayOption as any,
        []
    )
    .option(
        '--include-fixture <glob>',
        'A glob pattern to determine what fixtures to include in the evaluation',
        arrayOption as any,
        []
    )
    .option(
        '--exclude-fixture <glob>',
        'A glob pattern to determine what fixtures exclude in the evaluation',
        arrayOption as any,
        []
    )
    .option(
        '--include-filepath <glob>',
        'A glob pattern to determine what files to include in the evaluation',
        arrayOption as any,
        []
    )
    .option(
        '--exclude-filepath <glob>',
        'A glob pattern to determine what files exclude in the evaluation',
        arrayOption as any,
        []
    )
    .addOption(
        new commander.Option('--bfg-binary <path>', 'Optional path to a BFG binary').env('BFG_BINARY')
    )
    .option(
        '--tree-sitter-grammars <path>',
        'Path to a directory containing tree-sitter grammars',
        path.resolve(__dirname, '../../vscode/dist')
    )
    .option('--queries-directory <path>', 'Path to a directory containing tree-sitter queries')
    .option(
        '--test-typecheck',
        'If enabled, runs the test command to typecheck the generated code',
        booleanOption,
        false // disabled by default because it's slow and requires custom configuration
    )
    .option(
        '--test-parse',
        'If enabled, parses the generated code to validate whether it has syntax errors or not',
        booleanOption,
        true
    )
    .action(async (options: EvaluateAutocompleteOptions) => {
        const testOptions = await loadEvaluationConfig(options)
        const workspacesToRun = testOptions.filter(
            testOptions =>
                matchesGlobPatterns(
                    options.includeWorkspace,
                    options.excludeWorkspace,
                    testOptions.workspace
                ) &&
                matchesGlobPatterns(
                    options.includeFixture,
                    options.excludeFixture,
                    testOptions.fixture.name
                )
        )
        await Promise.all(workspacesToRun.map(workspace => evaluateWorkspace(workspace)))
    })

async function evaluateWorkspace(options: EvaluateAutocompleteOptions): Promise<void> {
    console.log(`starting evaluation: fixture=${options.fixture.name} workspace=${options.workspace}`)

    if (!options.queriesDirectory) {
        console.error('missing required options: --queries-directory')
        process.exit(1)
    }
    if (!options.srcAccessToken) {
        console.error('environment variable SRC_ACCESS_TOKEN must be non-empty')
        process.exit(1)
    }
    if (!options.srcEndpoint) {
        console.error('environment variable SRC_ENDPOINT must be non-empty')
        process.exit(1)
    }

    const workspaceRootUri = vscode.Uri.from({ scheme: 'file', path: options.workspace })

    const client = await newAgentClient({
        name: 'evaluate-autocomplete',
        version: '0.1.0',
        workspaceRootUri: workspaceRootUri.toString(),
        extensionConfiguration: {
            accessToken: options.srcAccessToken,
            serverEndpoint: options.srcEndpoint,
            customHeaders: {},
            customConfiguration: options.fixture.customConfiguration,
        },
        codyAgentPath: options.codyAgentBinary,
    })
    try {
        if (options.fixture.strategy === EvaluationStrategy.BFG) {
            await evaluateBfgStrategy(client, options)
        } else if (options.fixture.strategy === EvaluationStrategy.GitLog) {
            await evaluateGitLogStrategy(client, options)
        }
    } catch (error) {
        console.error('unexpected error running evaluate-autocomplete', error)
    }
    await client.request('shutdown', null)
    client.notify('exit', null)
}
