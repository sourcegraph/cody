import { PromptString, contextFiltersProvider } from '@sourcegraph/cody-shared'
import { ParsedDiff, diffLines, structuredPatch } from 'diff'
import { debounce } from 'lodash'
import { v4 } from 'uuid'
import * as vscode from 'vscode'

import Parser from 'web-tree-sitter'
import { refactorCodeLensProvider } from '../../commands/services/refactor-code-lenses'
import { lines } from '../../completions/text-processing'
import { asPoint, getCachedParseTreeForDocument } from '../../tree-sitter/parse-tree-cache'
import { parseString } from '../../tree-sitter/parser'
import { execQueryWrapper } from '../../tree-sitter/query-sdk'

interface TrackedDocument {
    content: string
    changes: { timestamp: number; change: vscode.TextDocumentContentChangeEvent }[]
    tree: Parser.Tree | undefined
}

export class RecentEditsRetriever implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    // We use a map from the document URI to the set of tracked completions inside that document to
    // improve performance of the `onDidChangeTextDocument` event handler.
    private trackedDocuments: Map<string, TrackedDocument> = new Map()

    constructor(
        private readonly maxAgeMs: number,
        readonly workspace: Pick<
            typeof vscode.workspace,
            'onDidChangeTextDocument' | 'onDidRenameFiles' | 'onDidDeleteFiles'
        > = vscode.workspace
    ) {
        const debouncedFindOutdatedChanges = debounce(this.findRefactorSymbols.bind(this), 250)

        this.disposables.push(workspace.onDidChangeTextDocument(debouncedFindOutdatedChanges))
        this.disposables.push(workspace.onDidChangeTextDocument(this.onDidChangeTextDocument.bind(this)))
        this.disposables.push(workspace.onDidRenameFiles(this.onDidRenameFiles.bind(this)))
        this.disposables.push(workspace.onDidDeleteFiles(this.onDidDeleteFiles.bind(this)))
    }

    public async getDiff(
        uri: vscode.Uri,
        withinRange: vscode.Range | null = null
    ): Promise<PromptString | null> {
        if (await contextFiltersProvider.isUriIgnored(uri)) {
            return null
        }

        const trackedDocument = this.trackedDocuments.get(uri.toString())
        if (!trackedDocument) {
            return null
        }

        const oldContent = trackedDocument.content
        const newContent = applyChanges(
            oldContent,
            trackedDocument.changes.map(c => c.change),
            withinRange
        )
        return PromptString.fromGitDiff(uri, oldContent, newContent)
    }

    public async getStructuredPatch(uri: vscode.Uri): Promise<{
        oldContent: string
        newContent: string
        patch: ParsedDiff
        trackedDocument: TrackedDocument
    } | null> {
        if (await contextFiltersProvider.isUriIgnored(uri)) {
            return null
        }

        const trackedDocument = this.trackedDocuments.get(uri.toString())
        if (!trackedDocument) {
            return null
        }
        const oldContent = trackedDocument.content
        const newContent = applyChanges(
            oldContent,
            trackedDocument.changes.map(c => c.change)
        )

        return {
            oldContent,
            newContent,
            trackedDocument,
            patch: structuredPatch(uri.path, uri.path, oldContent, newContent, undefined, undefined, {
                context: 0,
            }),
        }
    }

    private async findRefactorSymbols(event: vscode.TextDocumentChangeEvent): Promise<void> {
        const { uri, languageId } = event.document
        // const diffPromptString = await this.getDiff(uri)
        const res = await this.getStructuredPatch(uri)

        if (!res) {
            return
        }

        const { oldContent, newContent, patch, trackedDocument } = res
        const cache = getCachedParseTreeForDocument(event.document)

        if (!trackedDocument.tree || !cache) {
            return
        }
        // const diff = diffPromptString.toString()
        // const diffLines = diff.split('\n').slice(3)

        // const modifiedLines = diffLines.map(line => {
        //     if (line.startsWith('+')) {
        //         return line.replace('+', '')
        //     }

        //     if (line.startsWith('-')) {
        //         return line.replace('-', '')
        //     }

        //     return line
        // })

        // const modifiedDiff = modifiedLines.join('\n')
        // const tree = parseString(languageId, modifiedDiff)
        const oldNodes = execQueryWrapper({
            languageId,
            queryPoints: {
                startPoint: asPoint({
                    line: 0,
                    character: 0,
                }),
                endPoint: asPoint({
                    line: lines(trackedDocument.content).length,
                    character: 999,
                }),
            },
            tree: trackedDocument.tree,
            queryWrapper: 'getRefactorableNodes',
        })

        const oldFunctions = oldNodes.map(capture => {
            const identifierNode = capture.node.children.find(child => child.type === 'identifier')
            const formalParametersNode = capture.node.children.find(
                child => child.type === 'formal_parameters'
            )!

            const parameters = formalParametersNode.children.filter(child =>
                child.type.includes('parameter')
            )
            return {
                identifierNode,
                name: identifierNode ? identifierNode.text : '',
                parameters: parameters.map(p => p.text),
            }
        })

        const newNodes = execQueryWrapper({
            languageId,
            queryPoints: {
                startPoint: asPoint({
                    line: 0,
                    character: 0,
                }),
                endPoint: asPoint({
                    line: lines(event.document.getText()).length,
                    character: 999,
                }),
            },
            tree: cache.tree,
            queryWrapper: 'getRefactorableNodes',
        })

        const newFunctions = newNodes.map(capture => {
            const identifierNode = capture.node.children.find(child => child.type === 'identifier')
            const formalParametersNode = capture.node.children.find(
                child => child.type === 'formal_parameters'
            )!

            const parameters = formalParametersNode.children.filter(child =>
                child.type.includes('parameter')
            )
            return {
                identifierNode,
                name: identifierNode ? identifierNode.text : '',
                parameters: parameters.map(p => p.text),
            }
        })

        const changedNodes = newFunctions.filter(newFunction => {
            const matchingOldFunction = oldFunctions.find(
                oldFunction => oldFunction.name === newFunction.name
            )
            return (
                !matchingOldFunction ||
                JSON.stringify(matchingOldFunction.parameters) !== JSON.stringify(newFunction.parameters)
            )
        })

        console.log('changedNodes: ', changedNodes.map(node => node.name).join('\n\n'))

        refactorCodeLensProvider.showCodeLenses(
            event.document,
            changedNodes.map(c => {
                return { node: c.identifierNode!, id: v4(), state: 'idle' }
            })
        )

        // let functionDeclarationNode: Parser.SyntaxNode | null = null

        // function getChangedLines(diffData: ParsedDiff): number[] {
        //     const changedLines: number[] = []

        //     for (const hunk of diffData.hunks) {
        //         let oldLineNumber = hunk.oldStart
        //         let newLineNumber = hunk.newStart

        //         for (const line of hunk.lines) {
        //             if (line.startsWith('-')) {
        //                 changedLines.push(oldLineNumber)
        //                 oldLineNumber++
        //             } else if (line.startsWith('+')) {
        //                 changedLines.push(newLineNumber)
        //                 newLineNumber++
        //             } else {
        //                 oldLineNumber++
        //                 newLineNumber++
        //             }
        //         }
        //     }

        //     return [...new Set(changedLines)].sort((a, b) => a - b)
        // }

        // console.log('getChangedLines')

        // function findParentStuff(node: Parser.SyntaxNode): void {
        //     let isInFunctionParameterList = false
        //     let current: Parser.SyntaxNode | null = node
        //     while (current) {
        //         if (current.type === 'formal_parameters') {
        //             isInFunctionParameterList = true
        //             functionDeclarationNode = current.parent
        //             break
        //         }
        //         current = current.parent
        //     }
        // }

        // for (const line of getChangedLines(patch)) {
        //     const lineToQuery = line - 1
        //     const cache = getCachedParseTreeForDocument(event.document)

        //     if (cache) {
        //         const node = cache.tree.rootNode.descendantForPosition(
        //             asPoint({ line: lineToQuery, character: 0 })
        //         )

        //         let isInFunctionParameterList = false
        //         let current: Parser.SyntaxNode | null = node
        //         while (current) {
        //             if (current.type === 'formal_parameters') {
        //                 isInFunctionParameterList = true
        //                 functionDeclarationNode = current.parent
        //                 break
        //             }
        //             current = current.parent
        //         }

        //         if (!functionDeclarationNode) {
        //             const queryPoints = {
        //                 startPoint: asPoint({
        //                     line: lineToQuery,
        //                     character: 0,
        //                 }),
        //                 endPoint: asPoint({
        //                     line: lineToQuery,
        //                     character: 999,
        //                 }),
        //             }

        //             const x = execQueryWrapper({
        //                 languageId,
        //                 queryPoints,
        //                 tree: cache.tree,
        //                 queryWrapper: 'getRefactorableNodes',
        //             })

        //             console.log({ x })

        //             const parameterNode = x[0]?.node
        //             findParentStuff(parameterNode)
        //         }
        //     }
        // }

        // console.log('functionDeclarationNode', functionDeclarationNode?.text)

        // if (!tree) {
        //     return
        // }
        // const queryPoints = {
        //     startPoint: asPoint({
        //         line: 0,
        //         character: 0,
        //     }),
        //     endPoint: asPoint({
        //         line: lines(modifiedDiff).length,
        //         character: modifiedDiff.length,
        //     }),
        // }

        // const x = execQueryWrapper({
        //     languageId,
        //     queryPoints,
        //     tree,
        //     queryWrapper: 'getRefactorableNodes',
        // })

        // console.log({ x })
        // if (functionDeclarationNode) {
        //     refactorCodeLensProvider.showCodeLenses(event.document, functionDeclarationNode)
        // }
    }

    private onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
        let trackedDocument = this.trackedDocuments.get(event.document.uri.toString())
        if (!trackedDocument) {
            trackedDocument = this.trackDocument(event.document)
        }

        const now = Date.now()
        for (const change of event.contentChanges) {
            trackedDocument.changes.push({
                timestamp: now,
                change,
            })
        }

        this.reconcileOutdatedChanges()
    }

    private onDidRenameFiles(event: vscode.FileRenameEvent): void {
        for (const file of event.files) {
            const trackedDocument = this.trackedDocuments.get(file.oldUri.toString())
            if (trackedDocument) {
                this.trackedDocuments.set(file.newUri.toString(), trackedDocument)
                this.trackedDocuments.delete(file.oldUri.toString())
            }
        }
    }

    private onDidDeleteFiles(event: vscode.FileDeleteEvent): void {
        for (const uri of event.files) {
            this.trackedDocuments.delete(uri.toString())
        }
    }

    public dispose(): void {
        this.trackedDocuments.clear()
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }

    private trackDocument(document: vscode.TextDocument): TrackedDocument {
        const cache = getCachedParseTreeForDocument(document)
        const trackedDocument: TrackedDocument = {
            content: document.getText(),
            tree: cache?.tree.copy(),
            changes: [],
        }
        this.trackedDocuments.set(document.uri.toString(), trackedDocument)
        return trackedDocument
    }

    private reconcileOutdatedChanges(): void {
        const now = Date.now()
        for (const [, trackedDocument] of this.trackedDocuments) {
            const firstNonOutdatedChangeIndex = trackedDocument.changes.findIndex(
                c => now - c.timestamp < this.maxAgeMs
            )

            const outdatedChanges = trackedDocument.changes.slice(0, firstNonOutdatedChangeIndex)
            trackedDocument.content = applyChanges(
                trackedDocument.content,
                outdatedChanges.map(c => c.change)
            )
            trackedDocument.changes = trackedDocument.changes.slice(firstNonOutdatedChangeIndex)
        }
    }
}

function applyChanges(
    content: string,
    changes: vscode.TextDocumentContentChangeEvent[],
    withinRange: vscode.Range | null = null
): string {
    for (const change of changes) {
        const skip = withinRange && !withinRange.contains(change.range)

        if (skip) {
            continue
        }

        content =
            content.slice(0, change.rangeOffset) +
            change.text +
            content.slice(change.rangeOffset + change.rangeLength)
    }
    return content
}
