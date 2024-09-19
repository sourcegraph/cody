import { PromptString, getSimplePreamble, ps } from '@sourcegraph/cody-shared'
import { groupBy, uniqBy } from 'lodash'
import parseGitDiff, { type AddedFile, type ChangedFile, type Chunk } from 'parse-git-diff'
import * as vscode from 'vscode'
import { SymbolKind } from 'vscode-languageserver-protocol'
import { PromptBuilder } from '../../prompt-builder'
import { vscodeGitAPI } from '../../repository/git-extension-api'
import {
    type CandidateFile,
    type CanidateFileContent,
    type Ctx,
    type Detector,
    Score,
    type SuggestedPrompt,
} from './Detector'
import { combineStream } from './util'

type Data = {
    changedFile?: ChangedFile
    addedFile?: AddedFile
}

export class OutdatedSymbolDocumentationDetector implements Detector<Data> {
    async candidates(
        randomSample: CanidateFileContent<any>[],
        ctx: Ctx,
        abort?: AbortSignal
    ): Promise<CandidateFile<Data>[]> {
        const workspace = vscode.workspace.workspaceFolders ?? []
        const modifiedFiles = await Promise.all(workspace.map(getFileDiffsForWorkspace))

        const uniqueModifiedFiles = uniqBy(
            modifiedFiles.flat().sort((a, b) => b.score - a.score),
            v => v.uri.fsPath
        )

        return uniqueModifiedFiles
    }
    async detect(
        candidate: CanidateFileContent<Data>,
        ctx: Ctx,
        abort?: AbortSignal
    ): Promise<SuggestedPrompt[] | undefined> {
        // for a file get the symbols that the change overlaps with
        // Skip added files for now
        if (candidate.data.addedFile) {
            return
        }
        const diff = (candidate.data.addedFile ?? candidate.data.changedFile)!
        const chunks = diff?.chunks.filter(c => c.type === 'Chunk')

        const queue = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            candidate.uri
        )
        const allSymbols = []
        while (queue.length > 0) {
            const symbol = queue.shift()
            if (!symbol) {
                continue
            }
            allSymbols.push(symbol)
            queue.push(...symbol.children)
        }

        const symbols =
            allSymbols?.filter(
                symbol =>
                    symbol.kind === vscode.SymbolKind.Function ||
                    symbol.kind === vscode.SymbolKind.Method ||
                    symbol.kind === vscode.SymbolKind.Constructor ||
                    symbol.kind === vscode.SymbolKind.Class ||
                    symbol.kind === vscode.SymbolKind.Interface
            ) ?? []

        const symbolDiffs = new Map<vscode.DocumentSymbol, Chunk[]>()
        for (const chunk of chunks) {
            const start = chunk.toFileRange.start
            const end = start + chunk.toFileRange.lines
            // find matching symbols
            for (const symbol of symbols) {
                const intersection = symbol.range.intersection(new vscode.Range(start, 0, end, 0))
                if (intersection) {
                    const existingChunks = symbolDiffs.get(symbol) ?? []
                    existingChunks.push(chunk)
                    symbolDiffs.set(symbol, existingChunks)
                }
            }
        }
        const symbolChangedCount = new Map(
            Array.from(symbolDiffs.entries()).map(
                ([symbol, chunks]) =>
                    [
                        symbol,
                        chunks.map(c => c.fromFileRange.lines).reduce((acc, v) => acc + v, 0),
                    ] as const
            )
        )
        const biggestSymbol = Array.from(symbolDiffs.keys()).reduce((acc, v) => {
            if (!acc) {
                return v
            }
            const toBeat = symbolChangedCount.get(acc) ?? 0
            const vSize = symbolChangedCount.get(v) ?? 0

            if (vSize > toBeat) {
                return v
            }
            return acc
        })

        const promptBuilder = await PromptBuilder.create(ctx.model.contextWindow)
        if (
            !promptBuilder.tryAddToPrefix(
                getSimplePreamble(
                    ctx.model.id,
                    ctx.apiVersion,
                    'Default',
                    ps`
            You are a comment validator. You will be asked about a symbol and the associated block comment. The block comment might not exist or might even contain invalid or outated information. It is your task to identify these issues.
            When asked to produce JsonValidation you must only reply with a JSON object using the following schema:
            {
                // True if there is a block comment before the symbol. It doesn't matter if the comment is outdated or refers to another symbol
                hasCommentBefore: boolean
                // True if the block comment accurately describes the signature of the symbol
                commentMatchesSignature: boolean
                // True if the block comment accurately describes the functionality / body of the symbol
                commentMatchesFunctionality: boolean
            }
        `
                )
            )
        ) {
            return
        }
        const kind = biggestSymbol.kind === SymbolKind.Function ? 'function' : 'method'

        promptBuilder.tryAddMessages([
            {
                speaker: 'human',
                text: ps`Evaluate ${
                    PromptString.fromContextItem({
                        uri: candidate.uri,
                        type: 'symbol',
                        symbolName: biggestSymbol.name,
                        title: biggestSymbol.name,
                        kind,
                    }).title ?? ''
                }. Output only JsonValidation`,
            },
        ])

        const { ignored, limitReached } = await promptBuilder.tryAddContext('user', [
            { uri: candidate.uri, type: 'file', content: candidate.content },
        ])
        if (ignored.length > 0 || limitReached) {
            return
        }

        const messages = promptBuilder.build()
        const responseStream = ctx.chatClient.chat(
            messages,
            {
                model: ctx.model.id,
                maxTokensToSample: ctx.model.contextWindow.output,
            },
            abort
        )
        const response = await combineStream(responseStream, abort)
        const parsedResponse: {
            hasCommentBefore: boolean
            commentMatchesSignature: boolean
            commentMatchesFunctionality: boolean
        } = JSON.parse(response ?? '')
        if (
            !parsedResponse.hasCommentBefore ||
            !(
                parsedResponse.commentMatchesFunctionality === false ||
                parsedResponse.commentMatchesSignature === false
            )
        ) {
            return
        }

        const cta = parsedResponse.commentMatchesFunctionality
            ? `Fix the comment to match the updated body of **${biggestSymbol.name}**`
            : `Update the comment to match the signature for **${biggestSymbol.name}**`

        return [
            {
                cta,
                prompt: ps`Update the comment for @symbol`,
                score: Score.WOW,
                hiddenInstructions: ps``,
            },
        ]
    }
}

async function getFileDiffsForWorkspace(ws: vscode.WorkspaceFolder) {
    const repository = vscodeGitAPI?.getRepository(ws.uri)
    if (!repository) {
        return []
    }
    const diff = await repository.diff()
    const parsedDiff = parseGitDiff(diff)

    const candidates = []
    const groupedFileDiffs = groupBy(
        parsedDiff.files.flatMap(v => {
            switch (v.type) {
                case 'AddedFile':
                    return { path: v.path, addedFile: v }
                case 'ChangedFile':
                    return { path: v.path, changedFile: v }
                default:
                    return null as never
            }
        }),
        'path'
    )
    for (const fileDiffs of Object.values(groupedFileDiffs)) {
        const topAnyDiff = fileDiffs.find(v => v.addedFile) ?? fileDiffs[0]
        const topDiff = topAnyDiff.addedFile ?? topAnyDiff.changedFile
        const uri = vscode.Uri.joinPath(repository.rootUri, topDiff.path)
        candidates.push({
            uri,
            score: topDiff.type === 'AddedFile' ? Score.AWESOME : Score.COOL,
            data: {
                ...topAnyDiff,
            },
        })
    }
    return candidates
}
