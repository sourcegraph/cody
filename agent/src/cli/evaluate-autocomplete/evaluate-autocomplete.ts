import { execSync } from 'child_process'
import * as fspromises from 'fs/promises'
import * as path from 'path'

import { Command, Option } from 'commander'
import { calcPatch } from 'fast-myers-diff'
import { minimatch } from 'minimatch'
import { rimraf } from 'rimraf'
import { Range, Uri } from 'vscode'
import { QueryCapture } from 'web-tree-sitter'

import { Input } from '@sourcegraph/scip-typescript/src/Input'
import * as scip from '@sourcegraph/scip-typescript/src/scip'
import { formatSnapshot } from '@sourcegraph/scip-typescript/src/SnapshotTesting'

import { getParseLanguage } from '../../../../vscode/src/completions/tree-sitter/grammars'
import { createParser } from '../../../../vscode/src/completions/tree-sitter/parser'
import { newEmbeddedAgentClient } from '../../agent'
import { AgentTextDocument } from '../../AgentTextDocument'
import { InProcessClient } from '../../jsonrpc-alias'
import { getLanguageForFileName } from '../../language'
import { AutocompleteResult } from '../../protocol-alias'
import * as vscode_shim from '../../vscode-shim'

import { Queries } from './Queries'

interface EvaluateAutocompleteOptions {
    workspace: string
    treeSitterGrammars: string
    queries: string
    testCount: string
    includePattern: string
    excludePattern: string
    srcAccessToken: string
    srcEndpoint: string
    snapshotDirectory: string
    bfgBinary?: string
}

export const evaluateAutocompleteCommand = new Command('evaluate-autocomplete')
    .description('Evaluate Cody autocomplete by running the Agent in headless mode')
    .option('--workspace <path>', 'The workspace directory where to run the autocomplete evaluation', process.cwd())
    .option('--test-count <number>', 'The number of autocomplete requests to run in this evaluation', '10')
    .option(
        '--snapshot-directory <path>',
        'Directory where to write snapshot files to document autocomplete results',
        ''
    )
    .addOption(
        new Option('--src-access-token <token>', 'The Sourcegraph access token to use for authentication').env(
            'SRC_ACCESS_TOKEN'
        )
    )
    .addOption(
        new Option('--src-endpoint <url>', 'The Sourcegraph URL endpoint to use for authentication').env('SRC_ENDPOINT')
    )
    .option(
        '--include-pattern <glob>',
        'A glob pattern to determine what file paths to include in the evaluation',
        '**'
    )
    .option('--exclude-pattern <glob>', 'A glob pattern to determine what file paths to exclude in the evaluation', '')
    .addOption(new Option('--bfg-binary <path>', 'Optional path to a BFG binary').env('BFG_BINARY'))
    .option(
        '--tree-sitter-grammars <path>',
        'Path to a directory containing tree-sitter grammars',
        path.resolve(__dirname, '../../vscode/dist')
    )
    .option('--queries <path>', 'Path to a directory containing tree-sitter queries')
    .action(async (options: EvaluateAutocompleteOptions) => {
        // canonicalize and make path absolute
        const workspace = path.normalize(options.workspace)

        if (!options.queries) {
            console.log('missing required options: --queries')
            process.exit(1)
        }
        if (!options.srcAccessToken) {
            console.log('environment variable SRC_ACCESS_TOKEN must be non-empty')
            process.exit(1)
        }
        if (!options.srcEndpoint) {
            console.log('environment variable SRC_ENDPOINT must be non-empty')
            process.exit(1)
        }

        const workspaceRootUri = Uri.from({ scheme: 'file', path: workspace })
        const agent = await newEmbeddedAgentClient({
            name: 'evaluate-autocomplete',
            version: '0.1.0',
            workspaceRootUri: workspaceRootUri.toString(),
            extensionConfiguration: {
                accessToken: options.srcAccessToken,
                serverEndpoint: options.srcEndpoint,
                customHeaders: {},
            },
        })
        const client = agent.clientForThisInstance()
        try {
            await runEvalution(client, options, workspace)
        } catch (error) {
            console.error('unexpected error running evaluate-autocomplete', error)
        }
        await client.request('shutdown', null)
        client.notify('exit', null)
    })

/**
 * Runs autocomplete evaluation. The current logic is specifically optimized
 * to evaluate BFG.  The best way to customize the logic is by changing the
 * code. Eventually, we could make the logic configurable via command-line
 * flags so that we can reuse this command for different kinds of evaluations.
 */
async function runEvalution(
    client: InProcessClient,
    options: EvaluateAutocompleteOptions,
    workspace: string
): Promise<void> {
    vscode_shim.customConfiguration['cody.autocomplete.experimental.graphContext'] = 'bfg'
    vscode_shim.customConfiguration['cody.autocomplete.advanced.provider'] = 'fireworks'
    vscode_shim.customConfiguration['cody.autocomplete.advanced.model'] = 'starcoder-7b'
    vscode_shim.customConfiguration['cody.debug.verbose'] = 'true'
    if (options.bfgBinary) {
        vscode_shim.customConfiguration['cody.experimental.bfg.path'] = options.bfgBinary
    }
    const queries = new Queries(options.queries)
    const grammarDirectory = path.normalize(options.treeSitterGrammars)
    const files = execSync('git ls-files', { cwd: workspace }).toString().split('\n')
    let remainingTests = Number.parseInt(options.testCount, 10)
    if (options.snapshotDirectory) {
        await rimraf(options.snapshotDirectory)
    }
    for (const file of files) {
        if (!minimatch(file, options.includePattern)) {
            continue
        }
        if (options.excludePattern && minimatch(file, options.excludePattern)) {
            continue
        }
        const filePath = path.join(workspace, file)
        const stat = await fspromises.stat(filePath)
        if (!stat.isFile()) {
            continue
        }
        const content = (await fspromises.readFile(filePath)).toString()
        const language = getParseLanguage(getLanguageForFileName(file))
        if (!language) {
            continue
        }
        client.notify('textDocument/didOpen', { filePath, content })
        const parser = await createParser({ language, grammarDirectory })
        const tree = parser.parse(content)
        const query = await queries.loadQuery(parser, language, 'context')
        if (!query) {
            continue
        }

        const document = new scip.scip.Document({ relative_path: file })
        for (const match of query.matches(tree.rootNode)) {
            if (remainingTests <= 0) {
                break
            }
            for (const capture of match.captures) {
                if (remainingTests <= 0) {
                    break
                }
                if (capture.name === 'range') {
                    if (capture.node.startPosition.row !== capture.node.endPosition.row) {
                        // TODO: handle multi-line
                        continue
                    }
                    try {
                        const result = await triggerAutocomplete({ content, filePath, capture, client, document })
                        if (result.items.length > 0) {
                            remainingTests--
                        }
                    } catch {
                        // ignore. Most common issue is that autocomplete times out.
                    }
                }
            }
        }

        // Write snapshot file to disk we get non-empty autocomplete results.
        if (options.snapshotDirectory && document.occurrences.length > 0) {
            const outputPath = path.join(options.snapshotDirectory, file)
            await fspromises.mkdir(path.dirname(outputPath), { recursive: true })
            const input = new Input(filePath, content)
            const snapshot = formatSnapshot(input, document)
            await fspromises.writeFile(outputPath, snapshot)
        } else if (options.snapshotDirectory) {
            console.error(`Empty autocomplete: ${document.relative_path}`)
        }
    }
}

interface AutocompleteFixture {
    content: string
    filePath: string
    capture: QueryCapture
    client: InProcessClient
    document: scip.scip.Document
}

async function triggerAutocomplete(fixture: AutocompleteFixture): Promise<AutocompleteResult> {
    const { content, filePath, capture, client, document } = fixture
    // Modify the content by replacing the argument list to the call expression
    // with an empty argument list. This evaluation is interesting because it
    // allows us to test how good Cody is at inferring the original argument
    // list.
    const modifiedContent = [
        content.slice(0, capture.node.startIndex),
        '()',
        content.slice(capture.node.endIndex),
    ].join('')
    client.notify('textDocument/didChange', { filePath, content: modifiedContent })
    const result = await client.request('autocomplete/execute', {
        filePath,
        position: {
            line: capture.node.startPosition.row,
            character: capture.node.startPosition.column + 1,
        },
    })
    const textDocument = new AgentTextDocument({ filePath, content: modifiedContent })
    for (const item of result.items) {
        const range = new Range(
            item.range.start.line,
            item.range.start.character,
            item.range.end.line,
            item.range.end.character
        )
        const original = textDocument.getText(range)
        const completion = item.insertText
        for (const [sx, ex, text] of calcPatch(original, completion)) {
            if (sx !== ex) {
                // TODO: handle non-insert patches
                continue
            }
            const scipRange = [
                capture.node.startPosition.row,
                capture.node.startPosition.column,
                capture.node.endPosition.column,
            ]
            const occurrence = new scip.scip.Occurrence({
                symbol: text,
                range: scipRange,
                symbol_roles: 0,
            })
            document.occurrences.push(occurrence)
        }
    }
    return result
}
