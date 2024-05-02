import {
    type ContextItem,
    ContextItemSource,
    PACKAGE_CONTEXT_MENTION_PROVIDER,
    PromptString,
    logDebug,
    logError,
    ps,
    searchForFileChunks,
    searchForRepos,
    telemetryRecorder,
    uriBasename,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { toVSCodeRange } from '../../common/range'
import { getEditor } from '../../editor/active-editor'
import { getSmartSelection } from '../../editor/utils'
import type { ChatCommandResult } from '../../main'
import type { CodyCommandArgs } from '../types'
import { executeChat } from './ask'

/**
 * "Cody > Usage Examples" command (typically invoked by right-clicking on a symbol in the editor).
 *
 * **Status:** experimental
 */
export async function executeUsageExamplesCommand(
    args?: Partial<CodyCommandArgs>
): Promise<ChatCommandResult | undefined> {
    return wrapInActiveSpan('command.usageExamples', async span => {
        span.setAttribute('sampled', true)
        logDebug('executeUsageExampleCommand', 'executing', { args })
        telemetryRecorder.recordEvent('cody.command.usageExamples', 'executed', {
            interactionID: args?.requestID,
            privateMetadata: {
                requestID: args?.requestID,
                source: args?.source,
                traceId: span.spanContext().traceId,
            },
        })

        const abortController = new AbortController()

        const activeEditor = getEditor().active
        const doc = activeEditor?.document
        if (!doc) {
            return undefined
        }
        const symbolRange = doc.getWordRangeAtPosition((args?.range ?? activeEditor.selection).start)
        if (!symbolRange) {
            return undefined
        }

        const symbolText = PromptString.fromDocumentText(doc, symbolRange)

        // HACK(sqs): expand the range to include the `(` in a func call like `myFunc(`. Assumes the
        // next char is an open paren or similar.
        const symbolUseRange = symbolRange.with(undefined, symbolRange.end.translate(0, 1))
        const symbolUse = PromptString.fromDocumentText(doc, symbolUseRange)

        logDebug(
            'executeUsageExampleCommand',
            'symbol at cursor',
            JSON.stringify({ symbolText: symbolText.toString(), symbolUse: symbolUse.toString() })
        )

        const symbolPackage = await guessSymbolPackage(doc, symbolRange)
        logDebug('executeUsageExampleCommand', 'symbol package at cursor', JSON.stringify(symbolPackage))
        if (!symbolPackage) {
            vscode.window.showErrorMessage(`Unable to determine package for ${symbolText}.`)
            return undefined
        }

        const prompt = ps`Show usage examples for \`${symbolText}\` from the ${
            symbolPackage.ecosystem
        } package \`${
            symbolPackage.name
        }\`.\n(No preamble, 2 idiomatic distinct concise examples in ${PromptString.fromMarkdownCodeBlockLanguageIDForFilename(
            doc.uri
        )}, each with a Markdown header, a 1-sentence description, and then a code snippet.)`
        const contextFiles: ContextItem[] = []

        const snippetRange = expandRangeByLines(
            (await getSmartSelection(doc, symbolRange.start)) ?? symbolRange,
            10
        )
        contextFiles.push({
            type: 'file',
            uri: doc.uri,
            range: snippetRange,
            source: ContextItemSource.Editor,
        })

        try {
            contextFiles.push(
                ...(await symbolContextItems(
                    symbolText,
                    symbolUse,
                    symbolPackage,
                    abortController.signal
                ))
            )
        } catch (error) {
            void vscode.window.showErrorMessage(
                `Unable to get usage examples for ${symbolText}. ${error}`
            )
            logError('executeUsageExampleCommand', 'error finding usage examples', error)
            return undefined
        }

        return {
            type: 'chat',
            session: await executeChat({
                text: prompt,
                submitType: 'user-newchat',
                addEnhancedContext: false,
                contextFiles,
                source: args?.source,
            }),
        }
    })
}

/**
 * for a symbol `symbolText` in `symbolPackage` this function returns context items composed from:
 * - symbolPackage repository
 * - current repository
 * - organization repositories (dirname(current repository)) which import symbolPackage.
 * - dotcom repositories which import symbolPackage.
 *
 * We will mix context between the sources. Currently 5 context items from
 * each. Hackily only focussed on npm ecosystem.
 */
async function symbolContextItems(
    symbolText: PromptString,
    symbolUse: PromptString,
    symbolPackage: SymbolPackage | null,
    signal: AbortSignal
): Promise<ContextItem[]> {
    if (!symbolPackage) {
        return []
    }

    const packages = (
        await PACKAGE_CONTEXT_MENTION_PROVIDER.queryContextItems(
            `${symbolPackage.ecosystem}:${symbolPackage.name}`,
            { gitRemotes: [] }
        )
    ).filter(item => item.title === symbolPackage.name.toString())
    logDebug('executeUsageExampleCommand', 'found packages', JSON.stringify({ packages }))

    const globalRepos = (
        await Promise.all(
            packages.map(item =>
                searchForRepos(
                    'file:^package\\.json$ select:repo count:20 content:' +
                        JSON.stringify(JSON.stringify(item.title)), // inner stringify to match string in package.json, outer stringify for our query language
                    undefined
                )
            )
        )
    ).flat()
    logDebug('executeUsageExampleCommand', 'global repos', JSON.stringify({ globalRepos }))
    const uses = (
        await Promise.all(
            globalRepos.map(async repo =>
                repo instanceof Error
                    ? []
                    : await searchForFileChunks(
                          `repo:${repo.name} count:5 lang:typescript (content:${JSON.stringify(
                              symbolPackage.name
                          )} AND content:${JSON.stringify(symbolUse)})`,
                          signal
                      )
            )
        )
    ).flatMap(result => (result instanceof Error ? [] : result))
    logDebug(
        'executeUsageExampleCommand',
        'uses',
        JSON.stringify({ uses: uses.map(use => `${use.uri.toString()}: ${use.content.slice(0, 25)}`) })
    )

    const resolvedItems = (
        await Promise.all(
            packages.map(item => PACKAGE_CONTEXT_MENTION_PROVIDER.resolveContextItem!(item, symbolUse))
        )
    ).flat()
    const filteredItems = resolvedItems.filter(resolvedItem => includeContextItem(resolvedItem))
    logDebug('executeUsageExampleCommand', 'filtered items', JSON.stringify({ filteredItems }))
    if (filteredItems.length === 0) {
        throw new Error(`Unable to find enough usages of ${symbolText} to generate good usage examples.`)
    }

    return [
        ...filteredItems.map(
            item =>
                ({
                    ...item,
                    type: 'file',
                    range: item.range ? expandRangeByLines(toVSCodeRange(item.range)!, 10) : undefined,
                    source: ContextItemSource.Unified,
                }) satisfies ContextItem
        ),
        ...uses.map(
            use =>
                ({
                    ...use,
                    type: 'file',
                    title: uriBasename(use.uri),
                    source: ContextItemSource.Unified,
                }) satisfies ContextItem
        ),
    ]
}

interface SymbolPackage {
    name: PromptString
    ecosystem: PromptString
}

async function guessSymbolPackage(
    doc: vscode.TextDocument,
    symbolRange: vscode.Range
): Promise<SymbolPackage | null> {
    const defs: (vscode.Location | vscode.LocationLink)[] = await vscode.commands.executeCommand(
        'vscode.executeDefinitionProvider',
        doc.uri,
        symbolRange.start
    )

    // TODO(sqs): hacky and only supports npm.
    for (const def of defs) {
        const targetUri = def instanceof vscode.Location ? def.uri : def.targetUri
        const npmPackage = targetUri.path
            .match(/.*\/node_modules\/((?:[^@/]+)|(?:@[^/]+\/[^/]+))\//)?.[1]
            .replace(/^@types\//, '')
        if (npmPackage) {
            return {
                ecosystem: ps`npm`,
                name: PromptString.unsafe_fromUserQuery(npmPackage),
            }
        }
    }

    return null
}

function includeContextItem(item: ContextItem): boolean {
    return (
        !item.uri.path.endsWith('.map') &&
        !item.uri.path.endsWith('.tsbuildinfo') &&
        !item.uri.path.includes('.min') &&
        !item.uri.path.includes('/umd/') &&
        !item.uri.path.includes('/amd/') &&
        !item.uri.path.includes('/cjs/')
    )
}

function expandRangeByLines(range: vscode.Range, lines: number): vscode.Range {
    return new vscode.Range(
        range.start.translate(-1 * Math.min(range.start.line, lines)).with({ character: 0 }),
        range.end.translate(lines).with({ character: 0 })
    )
}
