import { PromptString, getSimplePreamble, ps } from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'
// import { getContextFilesForUnitTestCommand } from '../../commands/context/unit-test-file'
// import { isTestFileForOriginal } from '../../commands/utils/test-commands'
import { PromptBuilder } from '../../prompt-builder'
import {
    type CandidateFile,
    type CandidateFileContent,
    type Ctx,
    type Detector,
    Score,
    type SuggestedPrompt,
} from './Detector'
import { combineStream, reversedTuple } from './util'

interface Data {
    testFile: vscode.Uri
}

export class MissingDocumentationDetector implements Detector<Data> {
    async candidates(
        randomSample: CandidateFileContent<any>[],
        ctx: Ctx,
        abort?: AbortSignal
    ): Promise<CandidateFile<Data>[]> {
        return Promise.resolve(
            randomSample.map(sample => ({
                ...sample,
                score: Score.COOL,
                data: { testFile: sample.uri } as Data,
            }))
        )
    }
    async detect(
        candidate: CandidateFileContent<Data>,
        ctx: Ctx,
        abort?: AbortSignal
    ): Promise<SuggestedPrompt | undefined> {
        // Loop through current context to see if the file has an exisiting test file
        // const destinationFile = contextFiles.find(testFile => isTestFileForOriginal(uri, testFile.uri))?.uri
        const promptBuilder = await PromptBuilder.create(ctx.model.contextWindow)
        if (
            !promptBuilder.tryAddToPrefix(
                getSimplePreamble(ctx.model.id, ctx.apiVersion, 'Default', PRE_INSTRUCTIONS)
            )
        ) {
            return
        }
        promptBuilder.tryAddMessages(
            reversedTuple([
                // Important, messages are added in reverse order
                {
                    speaker: 'human',
                    text: ps`Find at most 3 undocumented public methods in ${
                        PromptString.fromContextItem({
                            uri: candidate.uri,
                            type: 'file',
                        }).title ?? ''
                    }, if any. Order the methods by complexity and assign a complexity score between 1 to 5. Explain why they are complex. Reply in the following JSON output format:
                        {
                            top3: [
                                {
                                    methodName: string,
                                    isDocumented: boolean,
                                    complexity: number,
                                    }
                                ]
                            }
                                    `,
                },
                {
                    speaker: 'assistant',
                    text: ps`Understood. I will perform your instructions and only reply with JSON once you give me the 'json-output' keyword.`,
                },
                { speaker: 'human', text: ps`json-output` },
            ])
        )
        const { ignored, limitReached } = await promptBuilder.tryAddContext('user', [
            { uri: candidate.data.testFile, type: 'file' },
            { uri: candidate.uri, type: 'file', content: candidate.content },
        ])
        if (ignored.length > 0 || limitReached) {
            return
        }
        const messages = await promptBuilder.build()
        //TODO: we could use the BotResponseMultiplexer for parsing out components and ending early
        const response = await combineStream(
            ctx.chatClient.chat(
                messages,
                {
                    model: ctx.model.id,
                    maxTokensToSample: ctx.model.contextWindow.output,
                },
                abort
            ),
            abort
        )
        if (!response) {
            return
        }
        const json = JSON.parse(response)
        const top: { feature: string; methodName: string; isDocumented: boolean; complexity: number } =
            json.top3[0]
        if (top.isDocumented || top.complexity < 4) {
            return
        }
        const outputPrompt = ps`Help me document ${PromptString.unsafe_fromLLMResponse(
            top.methodName
        )} in ${PromptString.fromDisplayPath(candidate.uri)}`
        // We can only have a single output message
        return {
            cta: `Add documentation to ${top.methodName} in ${PromptString.fromDisplayPath(
                candidate.uri
            )}`,
            prompt: outputPrompt,
            hiddenInstructions: ps`TO BE DONE`,
            score: candidate.score,
        }
    }
}

//Nothing right now
const PRE_INSTRUCTIONS = ps`
`
