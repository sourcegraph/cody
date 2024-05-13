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
import { ExecuteEditArguments } from '../../edit/execute'
import type { EditManager } from '../../edit/manager'
import { getEditor } from '../../editor/active-editor'
import { getSmartSelection } from '../../editor/utils'
import type { FixupTask } from '../../non-stop/FixupTask'
import { RecentEditsRetriever } from '../../supercompletions/recent-edits/recent-edits-retriever'
import type { CodyCommandArgs } from '../types'

const EDIT_HISTORY = 5 * 60 * 1000

export class UpdateCallsitesProvider implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private recentEditsRetriever: RecentEditsRetriever

    //private renderer: SupercompletionRenderer

    constructor(
        private readonly editManager: EditManager,
        readonly workspace: Pick<
            typeof vscode.workspace,
            'onDidChangeTextDocument' | 'onDidRenameFiles' | 'onDidDeleteFiles'
        > = vscode.workspace
    ) {
        // this.renderer = new SupercompletionRenderer()
        this.recentEditsRetriever = new RecentEditsRetriever(EDIT_HISTORY, workspace)

        this.disposables.push(
            /*
            vscode.commands.registerCommand(
                'cody.supercompletion.apply',
                (supercompletion: Supercompletion, range: vscode.Range) =>
                    this.applySupercompletion(supercompletion, range)
            ),
            vscode.commands.registerCommand(
                'cody.supercompletion.discard',
                (supercompletion: Supercompletion) => this.discardSupercompletion(supercompletion)
            ),
            */
            //this.renderer,
            this.recentEditsRetriever,
            this.editManager
        )
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }

    /**
     * "Cody > Update Callsites" command (typically invoked by right-clicking on a symbol in the editor).
     *
     * **Status:** experimental
     */
    public async executeUpdateCallsitesCommand(args?: Partial<CodyCommandArgs>): Promise<void> {
        return wrapInActiveSpan('command.updateCallsites', async span => {
            span.setAttribute('sampled', true)
            logDebug('executeUpdateCallsitesCommand', 'executing', { args })
            telemetryRecorder.recordEvent('cody.command.updateCallsites', 'executed', {
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

            const isDefinition = await this.isSymbolDefinition(doc, symbolRange)
            if (!isDefinition) {
                void vscode.window.showErrorMessage('Not a function definition')
                logError('executeUsageExampleCommand', 'not a function definition')
                return undefined
            }

            const symbolText = PromptString.fromDocumentText(doc, symbolRange)
            const callsites = await this.getSymbolCallsites(doc, symbolRange)
            /*
            const symbolFoldingRange = expandRangeByLines(
                (await getSmartSelection(doc, symbolRange.start)) ?? symbolRange,
                10
            )
            const symbolDefinitionText = PromptString.fromDocumentText(doc, symbolFoldingRange)
            */

            logDebug(
                'executing update callsites',
                JSON.stringify({
                    symbolRange,
                    symbolText,
                    callsites,
                })
            )

            const edits = await Promise.all(
                callsites.map(async callsite => {
                    const callsiteURI =
                        callsite instanceof vscode.Location ? callsite.uri : callsite.targetUri
                    const callsiteRange =
                        callsite instanceof vscode.Location ? callsite.range : callsite.targetRange
                    const callsiteDoc = await vscode.workspace.openTextDocument(callsiteURI)
                    const fixupRange = await getSmartSelection(callsiteDoc, callsiteRange.start)
                    if (!fixupRange) {
                        return undefined
                    }

                    const userContextFiles: ContextItem[] = [
                        {
                            type: 'file',
                            uri: doc.uri,
                            source: ContextItemSource.Editor,
                            content: doc.getText(),
                        },
                        {
                            type: 'file',
                            uri: callsiteDoc.uri,
                            source: ContextItemSource.Editor,
                            content: callsiteDoc.getText(),
                        },
                    ]

                    return this.editManager.executeEdit({
                        configuration: {
                            document: callsiteDoc,
                            instruction: ps`Update the arguments in call to \`${symbolText}\` in \`${PromptString.fromDisplayPath(
                                callsiteURI
                            )}\` based on the new definition of \`${symbolText}\` from \`${PromptString.fromDisplayPath(
                                doc.uri
                            )}\`. Make sure that the number, type and order of arguments passed to the \`${symbolText}\` call are all correct. Do not make any unneccessary edits if the arguments are already passed correctly.`,
                            userContextFiles,
                            range: fixupRange,
                            expandedRange: fixupRange,
                            intent: 'fix',
                            mode: 'edit',
                        },
                    })
                })
            )

            void vscode.window.showErrorMessage(`Unable to get callsites for ${symbolText}`)
            logError('executeUsageExampleCommand', 'error finding callsites')
        })
    }

    private async getSymbolCallsites(
        doc: vscode.TextDocument,
        symbolRange: vscode.Range
    ): Promise<(vscode.Location | vscode.LocationLink)[]> {
        const refs = await this.getSymbolRefs(doc, symbolRange)

        return refs.filter(ref => {
            const uri = ref instanceof vscode.Location ? ref.uri : ref.targetUri
            const range = ref instanceof vscode.Location ? ref.range : ref.targetRange

            return !range.isEqual(symbolRange) || uri.path !== doc.uri.path
        })
    }

    private async getSymbolRefs(
        doc: vscode.TextDocument,
        symbolRange: vscode.Range
    ): Promise<(vscode.Location | vscode.LocationLink)[]> {
        return vscode.commands.executeCommand(
            'vscode.executeReferenceProvider',
            doc.uri,
            symbolRange.start
        )
    }
    private async isSymbolDefinition(
        doc: vscode.TextDocument,
        symbolRange: vscode.Range
    ): Promise<boolean> {
        const defs: (vscode.Location | vscode.LocationLink)[] = await vscode.commands.executeCommand(
            'vscode.executeDefinitionProvider',
            doc.uri,
            symbolRange.start
        )

        return defs.reduce((matched, def) => {
            if (matched) {
                return true
            }

            const uri = def instanceof vscode.Location ? def.uri : def.targetUri
            const range = def instanceof vscode.Location ? def.range : def.targetRange

            return uri.path === doc.uri.path && range.start.line === symbolRange.start.line
        }, false)
    }
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
