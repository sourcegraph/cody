import {
    type ContextItem,
    ContextItemSource,
    PACKAGE_CONTEXT_MENTION_PROVIDER,
    PromptString,
    logDebug,
    ps,
    telemetryRecorder,
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
 * The command that generates a new docstring for the selected code.
 * When called, the command will be executed as an inline-edit command.
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
        logDebug(
            'executeUsageExampleCommand',
            'symbol text at cursor',
            JSON.stringify(symbolText.toString())
        )

        const symbolPackage = await guessSymbolPackage(doc, symbolRange)
        logDebug('executeUsageExampleCommand', 'symbol package at cursor', JSON.stringify(symbolPackage))
        if (!symbolPackage) {
            vscode.window.showErrorMessage(`Unable to determine package for ${symbolText}.`)
            return undefined
        }

        const prompt = ps`Show usage examples for \`${symbolText}\` from the ${PromptString.unsafe_fromUserQuery(
            symbolPackage.ecosystem
        )} package \`${PromptString.unsafe_fromUserQuery(
            symbolPackage.name
        )}\`.\n(No preamble, 2 concise examples in ${PromptString.fromMarkdownCodeBlockLanguageIDForFilename(
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

        if (symbolPackage) {
            const packages = (
                await PACKAGE_CONTEXT_MENTION_PROVIDER.queryContextItems(
                    `${symbolPackage.ecosystem}:${symbolPackage.name}`
                )
            ).filter(item => item.title === symbolPackage.name)
            logDebug('executeUsageExampleCommand', 'found packages', JSON.stringify({ packages }))
            const resolvedItems = (
                await Promise.all(
                    packages.map(item =>
                        PACKAGE_CONTEXT_MENTION_PROVIDER.resolveContextItem!(item, symbolText)
                    )
                )
            ).flat()
            logDebug('executeUsageExampleCommand', 'resolved items', JSON.stringify({ resolvedItems }))
            const filteredItems = resolvedItems.filter(resolvedItem => includeContextItem(resolvedItem))
            logDebug('executeUsageExampleCommand', 'filtered items', JSON.stringify({ filteredItems }))
            if (filteredItems.length === 0) {
                vscode.window.showErrorMessage(
                    `Unable to find enough usages of ${symbolText} to generate good usage examples.`
                )
                return undefined
            }
            try {
                const expandedItems = filteredItems.map(item => ({
                    ...item,
                    range: item.range ? expandRangeByLines(toVSCodeRange(item.range)!, 10) : undefined,
                }))
                contextFiles.push(...expandedItems)
            } catch (error) {
                vscode.window.showErrorMessage(`Unable to get usage examples for ${symbolText}.`)
                console.error(error)
                return undefined
            }
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

async function guessSymbolPackage(
    doc: vscode.TextDocument,
    symbolRange: vscode.Range
): Promise<{ ecosystem: string; name: string } | null> {
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
            return { ecosystem: 'npm', name: npmPackage }
        }
    }

    return null
}

function includeContextItem(item: ContextItem): boolean {
    return (
        !item.uri.path.endsWith('.map') &&
        !item.uri.path.endsWith('.tsbuildinfo') &&
        !item.uri.path.includes('/dist/') &&
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
