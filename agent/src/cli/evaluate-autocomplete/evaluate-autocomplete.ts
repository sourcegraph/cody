import * as fspromises from 'fs/promises'
import * as path from 'path'

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
    testTypecheck?: boolean
    testParse?: boolean
    srcAccessToken: string
    srcEndpoint: string

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
}

async function loadEvaluationConfig(options: EvaluateAutocompleteOptions): Promise<EvaluateAutocompleteOptions[]> {
    if (!options?.evaluationConfig) {
        return [options]
    }
    const configBuffer = await fspromises.readFile(options.evaluationConfig)
    const config = JSON.parse(configBuffer.toString()) as EvaluationConfig
    const result: EvaluateAutocompleteOptions[] = []
    for (const test of config?.workspaces ?? []) {
        if (!test.workspace) {
            console.error(`skipping test, missing required property 'workspace': ${JSON.stringify(test)}`)
            continue
        }
        const rootDir = path.dirname(options.evaluationConfig)
        const workspace = path.normalize(path.join(rootDir, test.workspace))
        const queriesDirectory = test.queriesDirectory
            ? path.join(rootDir, test.queriesDirectory)
            : config.queriesDirectory
            ? path.join(rootDir, config.queriesDirectory)
            : options.queriesDirectory
        const fixtures: EvaluationFixture[] = config.fixtures ?? [{ name: 'default', strategy: EvaluationStrategy.BFG }]
        for (const fixture of fixtures) {
            if (!fixture.strategy) {
                throw new Error(`missing: fixture.strategy: ${JSON.stringify(fixture)}`)
            }
            const snapshotDirectory = test.snapshotDirectory
                ? path.join(rootDir, test.snapshotDirectory, fixture.name, test.workspace)
                : config.snapshotDirectory
                ? path.join(rootDir, config.snapshotDirectory, fixture.name, test.workspace)
                : options.snapshotDirectory
            result.push({
                ...options,
                ...config,
                ...test,
                workspace,
                queriesDirectory,
                snapshotDirectory,
                fixture,
                csvPath: path.join(snapshotDirectory, 'autocomplete.csv'),
            })
        }
    }

    return result
}

export const evaluateAutocompleteCommand = new commander.Command('evaluate-autocomplete')
    .description('Evaluate Cody autocomplete by running the Agent in headless mode')
    .option('--workspace <path>', 'The workspace directory where to run the autocomplete evaluation', process.cwd())
    .option('--test-count <number>', 'The number of autocomplete requests to run in this evaluation', intOption)
    .option(
        '--max-file-test-count <number>',
        'The maximum number of autocomplete requests to evaluate in a single document',
        intOption,
        10
    )
    .option('--evaluation-config <path>', 'Path to a JSON with configuration for this evaluation', '')
    .option(
        '--snapshot-directory <path>',
        'Directory where to write snapshot files to document autocomplete results',
        ''
    )
    .addOption(
        new commander.Option(
            '--src-access-token <token>',
            'The Sourcegraph access token to use for authentication'
        ).env('SRC_ACCESS_TOKEN')
    )
    .addOption(
        new commander.Option('--src-endpoint <url>', 'The Sourcegraph URL endpoint to use for authentication').env(
            'SRC_ENDPOINT'
        )
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
    .addOption(new commander.Option('--bfg-binary <path>', 'Optional path to a BFG binary').env('BFG_BINARY'))
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
                matchesGlobPatterns(options.includeWorkspace, options.excludeWorkspace, testOptions.workspace) &&
                matchesGlobPatterns(options.includeFixture, options.excludeFixture, testOptions.fixture.name)
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
