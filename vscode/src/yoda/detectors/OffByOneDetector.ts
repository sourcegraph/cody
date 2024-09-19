import {
    type ContextItem,
    ContextItemSource,
    type ContextItemTree,
    PromptString,
    getSimplePreamble,
    ps,
    tracer,
    uriBasename,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { toStructuredMentions } from '../../chat/chat-view/ContextRetriever'
import { PromptBuilder } from '../../prompt-builder'
import {
    type CandidateFile,
    type CanidateFileContent,
    type Ctx,
    type Detector,
    Score,
    type SuggestedPrompt,
} from './Detector'
import { combineStream } from './util'

type Data = null
export class OffByOneDetector implements Detector<Data> {
    async candidates(
        randomSample: CanidateFileContent<any>[],
        ctx: Ctx,
        abort?: AbortSignal
    ): Promise<CandidateFile<Data>[]> {
        const inputTextWithoutContextChips = ps`Where do we increment or decrement index variables in a loop, check integer boundary conditions, or apply greater than / less than operators?`
        const mentions: ContextItem[] = []
        for (const ws of vscode.workspace.workspaceFolders ?? []) {
            mentions.push({
                type: 'tree',
                uri: ws.uri,
                title: 'Current Repository',
                name: ws.name,
                description: ws.name,
                isWorkspaceRoot: true,
                content: null,
                source: ContextItemSource.Initial,
                icon: 'folder',
            } satisfies ContextItemTree)
        }

        const structuredMentions = toStructuredMentions(mentions)
        const span = tracer.startSpan('OffByOneDetectorContext')
        const retrievedContext = await ctx.contextRetriever.retrieveContext(
            structuredMentions,
            inputTextWithoutContextChips,
            span,
            abort
        )
        const candidateFiles = retrievedContext.map(item => ({
            uri: item.uri,
            score: Score.WOW,
            data: null,
        }))

        //Hardcoded for demo
        const [demoFile] = await (vscode.workspace.findFiles('**/demo-mysterious.ts', null, 1) ?? [])
        if (demoFile) {
            candidateFiles.push({
                uri: demoFile,
                score: Score.WOW,
                data: null,
            })
        }

        return candidateFiles
    }
    async detect(
        candidate: CanidateFileContent<Data>,
        ctx: Ctx,
        abort?: AbortSignal
    ): Promise<SuggestedPrompt[] | undefined> {
        const promptBuilder = await PromptBuilder.create(ctx.model.contextWindow)
        if (
            !promptBuilder.tryAddToPrefix(
                getSimplePreamble(
                    ctx.model.id,
                    ctx.apiVersion,
                    'Default',
                    ps`
            You are a off-by-one checker that specifically finds places where an index, boundary condition check (such as i < 10), or offset calculation contains a hard-to-spot off-by-one error.
            You only return errors if you are highly confident that it is a mistake based on the context. When asked to reply ValidationJSON you must reply only with a JSON object that follows the schema below and you must not include any additional text.
            {
                // True if the file contains a confirmed off-by-one-error. False otherwise
                fileContainsOffByOneError: boolean
                // The symbol (function name, class) that contains the off-by-one error. Null if there is no off-by-one error or if the error is not within a symbol.
                enclosingSymbolName: string | null
            }
        `
                )
            )
        ) {
            return
        }

        promptBuilder.tryAddMessages([
            {
                speaker: 'human',
                text: ps`Evaluate ${
                    PromptString.fromContextItem({
                        uri: candidate.uri,
                        type: 'file',
                    }).title ?? ''
                } for off-by-one errors. Output only ValidationJSON`,
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
            fileContainsOffByOneError: boolean
            enclosingSymbolName: string | null
        } = JSON.parse(response ?? '')
        if (parsedResponse.fileContainsOffByOneError !== true) {
            return
        }

        return [
            {
                cta: `Debug the off-by-one error in ${uriBasename(candidate.uri)}`,
                prompt: ps`Help me locate the off-by-one bug in ${PromptString.fromDisplayPath(
                    candidate.uri
                )})}`,
                score: Score.WOW,
                hiddenInstructions: ps``,
            },
        ]
    }
}
