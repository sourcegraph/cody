import * as fspromises from 'node:fs/promises'
import * as path from 'node:path'
import { glob } from 'glob'

import * as commander from 'commander'
import * as vscode from 'vscode'

import { newAgentClient } from '../../agent'

import { exec } from 'node:child_process'
import fs from 'node:fs'
import { promisify } from 'node:util'
import {
    type ConfigurationUseContext,
    graphqlClient,
    isDefined,
    modelsService,
} from '@sourcegraph/cody-shared'
import { Observable } from 'observable-fns'
import { sleep } from '../../../../vscode/src/completions/utils'
import { startPollyRecording } from '../../../../vscode/src/testutils/polly'
import { dotcomCredentials } from '../../../../vscode/src/testutils/testing-credentials'
import { allClientCapabilitiesEnabled } from '../../allClientCapabilitiesEnabled'
import { codyPaths } from '../../codyPaths'
import { arrayOption, booleanOption, intOption } from './cli-parsers'
import { matchesGlobPatterns } from './matchesGlobPatterns'
import { evaluateAutocompleteStrategy } from './strategy-autocomplete'
import { evaluateChatStrategy } from './strategy-chat'
import { evaluateFixStrategy } from './strategy-fix'
import { evaluateGitLogStrategy } from './strategy-git-log'
import { evaluateUnitTestStrategy } from './strategy-unit-test'

export interface CodyBenchOptions {
    workspace: string
    absolutePath?: string
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
    context: { sourcesDir: string; strategy: ConfigurationUseContext }

    verbose: boolean
}

interface EvaluationConfig extends Partial<CodyBenchOptions> {
    workspaces: CodyBenchOptions[]
    fixtures?: EvaluationFixture[]
}

export enum BenchStrategy {
    Autocomplete = 'autocomplete',
    Chat = 'chat',
    Fix = 'fix',
    GitLog = 'git-log',
    UnitTest = 'unit-test',
}

interface EvaluationFixture {
    name: string
    customConfiguration?: Record<string, any>
    strategy: BenchStrategy
    codyAgentBinary?: string
}

async function loadEvaluationConfig(options: CodyBenchOptions): Promise<CodyBenchOptions[]> {
    if (!options?.evaluationConfig) {
        return [options]
    }
    const configBuffer = await fspromises.readFile(options.evaluationConfig)
    const config = JSON.parse(configBuffer.toString()) as EvaluationConfig
    const result: CodyBenchOptions[] = []
    const rootDir = path.dirname(options.evaluationConfig)
    for (const test of expandWorkspaces(config.workspaces, rootDir) ?? []) {
        if (!test.workspace) {
            console.error(
                `skipping test, missing required property 'workspace': ${JSON.stringify(test)}`
            )
            continue
        }
        const workspace = path.normalize(path.join(rootDir, test.workspace))
        const fixtures: EvaluationFixture[] = config.fixtures ?? [
            { name: 'default', strategy: BenchStrategy.Autocomplete },
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
                csvPath: path.join(snapshotDirectory, 'cody-bench.csv'),
            })
        }
    }

    return result
}

export const benchCommand = new commander.Command('bench')
    .description(
        'Evaluate Cody autocomplete by running the Agent in headless mode. ' +
            'See the repo https://github.com/sourcegraph/cody-bench-data for ' +
            'more details about running cody-bench and how to evaluate the data.'
    )
    .option(
        '--workspace <path>',
        'The workspace directory where to run the autocomplete evaluation',
        process.cwd()
    )
    .option(
        '--test-count <number>',
        'The number of autocomplete requests to run in this evaluation',
        intOption,
        10_000
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
    .option('--verbose', 'Verbose output', false)
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
        )
            .env('SRC_ENDPOINT')
            .default('https://sourcegraph.com')
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
    .option(
        '--queries-directory <path>',
        'Path to a directory containing tree-sitter queries',
        path.resolve(__dirname, '../src/cli/cody-bench/queries')
    )
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
    .action(async (options: CodyBenchOptions) => {
        if (!options.srcAccessToken) {
            const { token } = dotcomCredentials()
            if (!token) {
                console.error('environment variable SRC_ACCESS_TOKEN must be non-empty')
                process.exit(1)
            }
            options.srcAccessToken = token
        }
        if (!options.srcEndpoint) {
            console.error('environment variable SRC_ENDPOINT must be non-empty')
            process.exit(1)
        }

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

        // Required to use `PromptString`.
        graphqlClient.setResolvedConfigurationObservable(
            Observable.of({
                auth: {
                    accessToken: options.srcAccessToken,
                    serverEndpoint: options.srcEndpoint,
                    customHeaders: {},
                },
            })
        )

        const recordingDirectory = path.join(path.dirname(options.evaluationConfig), 'recordings')
        const polly = startPollyRecording({
            recordingName: 'cody-bench',
            recordingMode: 'replay',
            recordIfMissing: true,
            recordingDirectory,
            keepUnusedRecordings: true,
        })
        try {
            await Promise.all(
                workspacesToRun.map(workspace => evaluateWorkspace(workspace, recordingDirectory))
            )
        } finally {
            await polly.stop()
        }
        process.exit(0)
    })

async function evaluateWorkspace(options: CodyBenchOptions, recordingDirectory: string): Promise<void> {
    console.log(`starting evaluation: fixture=${options.fixture.name} workspace=${options.workspace}`)

    const workspaceRootUri = vscode.Uri.from({ scheme: 'file', path: options.workspace })

    const baseGlobalState: Record<string, any> = {}
    const editModel = options.fixture.customConfiguration?.['cody-bench.editModel']
    if (typeof editModel === 'string') {
        // There is no VSC setting yet to configure the base edit model. Users
        // can only modify this setting by changing it through the quickpick
        // menu in VSC.
        const provider = modelsService.instance!.getModelByIDSubstringOrError(editModel)
        baseGlobalState.editModel = provider.id
    }

    if (isDefined(options.context)) {
        await gitInitContextSourcesDir(options)
    }

    const { client } = await newAgentClient({
        name: 'cody-bench',
        version: '0.1.0',
        workspaceRootUri: workspaceRootUri.toString(),
        extensionConfiguration: {
            accessToken: options.srcAccessToken,
            serverEndpoint: options.srcEndpoint,
            customHeaders: {},
            customConfiguration: {
                'cody.experimental.symf.enabled': ['keyword', 'blended'].includes(
                    options.context?.strategy
                ), // disabling fixes errors in Polly.js related to fetching the symf binary
                'cody.experimental.localEmbeddings.enabled': ['embeddings', 'blended'].includes(
                    options.context?.strategy
                ),
                'cody.useContext': options.context?.strategy,
                'cody.experimental.telemetry.enabled': false,
                ...options.fixture.customConfiguration,
            },
            baseGlobalState,
        },
        codyAgentPath: options.codyAgentBinary,
        capabilities: allClientCapabilitiesEnabled,
        inheritStderr: true,
        extraEnvVariables: {
            CODY_RECORDING_NAME: `${options.fixture.name}-${path.basename(options.workspace)}`,
            CODY_RECORDING_DIRECTORY: recordingDirectory,
            CODY_RECORDING_MODE: 'replay',
            CODY_RECORD_IF_MISSING: 'true',
            CODY_KEEP_UNUSED_RECORDINGS: 'true',
            CODY_DISABLE_FASTPATH: 'true',
        },
    })
    if (isDefined(options.context)) {
        await indexContextSourcesDir(options)
    }
    try {
        if (options.fixture.strategy === BenchStrategy.Autocomplete) {
            await evaluateAutocompleteStrategy(client, options)
        } else if (options.fixture.strategy === BenchStrategy.GitLog) {
            await evaluateGitLogStrategy(client, options)
        }
        switch (options.fixture.strategy) {
            case BenchStrategy.Autocomplete:
                await evaluateAutocompleteStrategy(client, options)
                break
            case BenchStrategy.GitLog:
                await evaluateGitLogStrategy(client, options)
                break
            case BenchStrategy.Fix:
                await evaluateFixStrategy(client, options)
                break
            case BenchStrategy.Chat:
                await evaluateChatStrategy(client, options)
                break
            case BenchStrategy.UnitTest:
                await evaluateUnitTestStrategy(client, options)
                break
            default:
                throw new Error(`unknown strategy ${options.fixture.strategy}`)
        }
    } catch (error) {
        console.error('unexpected error running cody-bench', error)
    }
    console.log('cody-bench completed, shutting down...')
    await client.request('shutdown', null)
    client.notify('exit', null)
}

function expandWorkspaces(
    workspaces: CodyBenchOptions[] | undefined,
    rootDir: string
): CodyBenchOptions[] {
    if (!workspaces) {
        return []
    }
    return workspaces.flatMap(workspace => {
        workspace.absolutePath = path.normalize(path.join(rootDir, workspace.workspace))

        if (!workspace.workspace.endsWith('/*')) {
            return [workspace]
        }
        return glob
            .sync(workspace.workspace, {
                cwd: rootDir,
            })
            .flatMap(workspacePath => {
                return {
                    ...workspace,
                    workspace: workspacePath,
                    absolutePath: path.normalize(path.join(rootDir, workspacePath)),
                }
            })
    })
}

async function gitInitContextSourcesDir(options: CodyBenchOptions): Promise<void> {
    // If this is our first run, we need to git init the context sources dir so symf & embeddings pick it up
    if (fs.existsSync(path.join(options.workspace, '.git'))) {
        return
    }

    await promisify(exec)(
        `
        git init &&
        git add ${options.context.sourcesDir} &&
        git commit -m "initial commit" &&
        git remote add origin https://github.com/sgtest/cody-bench.git`,
        { cwd: options.workspace }
    )
}

async function indexContextSourcesDir(options: CodyBenchOptions): Promise<void> {
    // If this is our first run, we need to index the context sources dir so symf & embeddings can retrieve results
    // The agent has started symf by this point - we need to wait until the symf index has been created
    // TODO: for embeddings, we don't have access to do it the same way

    const symfIndex = path.join(codyPaths().data, 'symf/indexroot', options.workspace)

    // Allow max 10 min for the index to be ready
    const maxWaitTime = 10 * 60 * 1000
    const sleepTime = 5000
    let waitTime = 0
    while (waitTime < maxWaitTime) {
        if (fs.existsSync(symfIndex)) {
            console.log('Symf index ready')
            return
        }
        console.log('Symf index not ready, waiting...')
        waitTime += sleepTime
        await sleep(sleepTime)
    }

    throw new Error(`Symf index not ready after ${maxWaitTime / 60 / 1000} min, exiting`)
}
