import { PromptString, getSimplePreamble, ps, uriBasename } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
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
export class SQLOptimisationDetector implements Detector<Data> {
    async candidates(
        randomSample: CanidateFileContent<any>[],
        ctx: Ctx,
        abort?: AbortSignal
    ): Promise<CandidateFile<Data>[]> {
        return [
            {
                uri: vscode.Uri.joinPath(
                    vscode.workspace.workspaceFolders![0].uri,
                    'internal/database/repo_paths.go'
                ),
                score: Score.AWESOME,
                data: null,
            },
            {
                uri: vscode.Uri.joinPath(
                    vscode.workspace.workspaceFolders![0].uri,
                    'cmd/symbols/internal/rockskip/postgres.go'
                ),
                score: Score.AWESOME,
                data: null,
            },
        ]
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
            You are an expert in SQL. You are given a complex SQL query.
            You only return proposals if you are confident that it is performance improvement based on the context. When asked to reply ValidationJSON you must reply only with a JSON object that follows the schema below and you must not include any additional text.
            {
                optimisations: [
                    {
                        originalQuery: string,
                        // The optimised query. Null if there is no optimisation or if the optimisation is not within a symbol.
                        optimisedQuery: string | null,
                    },
                ]
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
                text: ps`Show code how to optimise the complex SQL query in ${
                    PromptString.fromContextItem({
                        uri: candidate.uri,
                        type: 'file',
                    }).title ?? ''
                } file. Also return proposed promt to ask for fixing SQL query in other files in this repositor. Output only ValidationJSON`,
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
            optimisations: any
        } = JSON.parse(response ?? '')
        if (
            parsedResponse.optimisations === null ||
            parsedResponse.optimisations.length === 0 ||
            parsedResponse.optimisations[0].optimisedQuery === null
        ) {
            return
        }

        return [
            {
                cta: `Improve SQL query in ${uriBasename(candidate.uri)}`,
                prompt: ps`Show code how to optimise the complex SQL query in  ${PromptString.fromDisplayPath(
                    candidate.uri
                )})}`,
                score: Score.WOW,
                hiddenInstructions: ps`Also return proposed promt to ask for fixing SQL query in other files in this repository`,
            },
        ]
    }
}
