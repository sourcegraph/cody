import { PromptString, ps } from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'
import { getContextFilesForUnitTestCommand } from '../../commands/context/unit-test-file'
import { isTestFileForOriginal } from '../../commands/utils/test-commands'
import { PromptBuilder } from '../../prompt-builder'
import {
    type CandidateFile,
    type CanidateFileContent,
    type Ctx,
    type Detector,
    Score,
    type SuggestedPrompt,
} from './Detector'
import { combineStream, reversedTuple } from './util'

interface Data {
    testFile: vscode.Uri
}

export class TestOpportunityDetector implements Detector<Data> {
    async candidates(
        randomSample: CanidateFileContent<any>[],
        ctx: Ctx,
        abort?: AbortSignal
    ): Promise<CandidateFile<Data>[]> {
        const candidates = await Promise.all(
            randomSample.map(async file => {
                try {
                    const contextFiles = await getContextFilesForUnitTestCommand(file.uri).catch(
                        () => []
                    )
                    const testFile = contextFiles.find(testFile =>
                        isTestFileForOriginal(file.uri, testFile.uri)
                    )?.uri
                    if (testFile) {
                        return [
                            {
                                ...file,
                                score: Score.join(file.score, Score.COOL),
                                data: { testFile },
                            } satisfies CandidateFile<Data>,
                        ]
                    }
                } catch {}
                return []
            })
        )
        return candidates.flat()
    }
    async detect(
        candidate: CanidateFileContent<Data>,
        ctx: Ctx,
        abort?: AbortSignal
    ): Promise<SuggestedPrompt | undefined> {
        // Loop through current context to see if the file has an exisiting test file
        // const destinationFile = contextFiles.find(testFile => isTestFileForOriginal(uri, testFile.uri))?.uri
        const promptBuilder = await PromptBuilder.create(ctx.model.contextWindow)
        await promptBuilder.tryAddMessages(
            reversedTuple([
                // Important, messages are added in reverse order
                {
                    speaker: 'human',
                    text: ps`Are there any important untested features or code-paths in ${PromptString.fromDisplayPath(
                        candidate.data?.testFile
                    )} for ${PromptString.fromDisplayPath(candidate.uri)}? Reply in the following JSON output format:
                        {
                            top3: [
                                {
                                    feature: string,
                                    symbolName: string,
                                    importance: 'high' | 'medium' | 'low'
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
        if (ignored || limitReached) {
            return
        }
        const messages = await promptBuilder.build()
        //TODO: we could use the BotResponseMultiplexer for parsing out components and ending early
        const response = await combineStream(
            ctx.chatClient.chat(
                messages,
                {
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
        const top: { feature: string; symbolName: string } = json.top3[0]
        const outputPrompt = await PromptBuilder.create(ctx.model.contextWindow)
        // We can only have a single output message
        outputPrompt.tryAddMessages([
            {
                speaker: 'human',
                text: ps`Help me test ${PromptString.unsafe_fromLLMResponse(
                    top.feature
                )} in ${PromptString.fromDisplayPath(candidate.uri)}`,
                contextFiles: [
                    {
                        uri: candidate.uri,
                        content: candidate.content,
                        type: 'file',
                    },
                ],
            },
        ])
        const [message, ...otherMessages] = outputPrompt.build()
        console.log(otherMessages)
        if (!message || !message.text) {
            return
        }
        return {
            cta: `Try fixing ${top.feature} in ${top.symbolName}`,
            prompt: message.text,
            hiddenInstructions: ps`TO BE DONE`,
            score: candidate.score,
        }
    }
}
