import {
    BotResponseMultiplexer,
    type ChatClient,
    type ChatMessage,
    type EditModel,
    type Message,
    ModelsService,
    PromptString,
    TokenCounter,
    getSimplePreamble,
    ps,
    psDedent,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { PromptBuilder } from '../../prompt-builder'
import { fuzzyFindLocation } from '../../supercompletions/utils/fuzzy-find-location'

const SMART_APPLY_TOPICS = {
    INSTRUCTION: ps`INSTRUCTION`,
    FILE_CONTENTS: ps`FILE_CONTENTS`,
    INCOMING: ps`INCOMING`,
    REPLACE: ps`REPLACE`,
} as const

const RESPONSE_PREFIX = ps`<${SMART_APPLY_TOPICS.REPLACE}>`
const SHARED_PARAMETERS = {
    stopSequences: [`</${SMART_APPLY_TOPICS.REPLACE}>`],
    assistantText: RESPONSE_PREFIX,
    assistantPrefix: RESPONSE_PREFIX,
}

const SMART_APPLY_PREFIX = `<${SMART_APPLY_TOPICS.REPLACE}>`

export const SMART_APPLY_PROMPT = {
    system: psDedent`
        - You are an AI programming assistant who is an expert in determiing the best way to apply a code snippet to a file.
        - Given a change, and the file where that change should be applied, you should determine the best way to apply the change to the file.
        - You will be provided with the contents of the current active file, enclosed in <${SMART_APPLY_TOPICS.FILE_CONTENTS}></${SMART_APPLY_TOPICS.FILE_CONTENTS}> XML tags.
        - You will be provided with an incoming change to a file, enclosed in <${SMART_APPLY_TOPICS.INCOMING}></${SMART_APPLY_TOPICS.INCOMING}> XML tags.
        - You will be provided with an instruction that the user provided to generate the incoming change, enclosed in <${SMART_APPLY_TOPICS.INSTRUCTION}></${SMART_APPLY_TOPICS.INSTRUCTION}> XML tags.
        - You will be asked to determine the best way to apply the incoming change to the file.
        - Do not provide any additional commentary about the changes you made.`,
    instruction: psDedent`
        We are in the file: {filePath}

        This file contains the following code:
        <${SMART_APPLY_TOPICS.FILE_CONTENTS}>{fileContents}</${SMART_APPLY_TOPICS.FILE_CONTENTS}>

        We have the following code to apply to the file:
        <${SMART_APPLY_TOPICS.INCOMING}>{incomingText}</${SMART_APPLY_TOPICS.INCOMING}>

        We generated this code from the following instruction that the user provided:
        <${SMART_APPLY_TOPICS.INSTRUCTION}>{instruction}</${SMART_APPLY_TOPICS.INSTRUCTION}>

        You should respond with the original code that should be updated, enclosed in <${SMART_APPLY_TOPICS.REPLACE}></${SMART_APPLY_TOPICS.REPLACE}> XML tags.

        Follow these specific rules:
        - If you find code that should be replaced, respond with the exact code enclosed within <${SMART_APPLY_TOPICS.REPLACE}></${SMART_APPLY_TOPICS.REPLACE}> XML tags.
        - If you cannot find code that should be replaced, and believe this code should be inserted into the file, respond with "<${SMART_APPLY_TOPICS.REPLACE}>INSERT</${SMART_APPLY_TOPICS.REPLACE}>"
        - If you believe that the contents of the entire file should be replaced, respond with "<${SMART_APPLY_TOPICS.REPLACE}>ENTIRE_FILE</${SMART_APPLY_TOPICS.REPLACE}>"
    `,
}

export const getPrompt = async (
    instruction: PromptString,
    replacement: PromptString,
    document: vscode.TextDocument,
    model: EditModel
): Promise<{ messages: Message[]; prefix: string }> => {
    const documentRange = new vscode.Range(0, 0, document.lineCount - 1, 0)
    const documentText = PromptString.fromDocumentText(document, documentRange)
    const tokenCount = TokenCounter.countPromptString(documentText)
    const contextWindow = ModelsService.getContextWindowByID(model)
    if (tokenCount > contextWindow.input) {
        throw new Error("The amount of text in this document exceeds Cody's current capacity.")
    }
    const promptBuilder = new PromptBuilder(contextWindow)

    // TODO: Implement api version
    const fakeApiVersion = 5
    const preamble = getSimplePreamble(model, fakeApiVersion, SMART_APPLY_PROMPT.system)
    promptBuilder.tryAddToPrefix(preamble)

    const text = SMART_APPLY_PROMPT.instruction
        .replaceAll('{instruction}', instruction)
        .replaceAll('{incomingText}', replacement)
        .replaceAll('{fileContents}', documentText)
        .replaceAll('{filePath}', PromptString.fromDisplayPath(document.uri))

    const transcript: ChatMessage[] = [{ speaker: 'human', text }]
    transcript.push({ speaker: 'assistant', text: SHARED_PARAMETERS.assistantText })

    promptBuilder.tryAddMessages(transcript.reverse())

    return { prefix: SMART_APPLY_PREFIX, messages: promptBuilder.build() }
}

export async function promptModelForOriginalCode(
    instruction: PromptString,
    replacement: PromptString,
    document: vscode.TextDocument,
    model: EditModel,
    client: ChatClient
): Promise<string> {
    const multiplexer = new BotResponseMultiplexer()
    const contextWindow = ModelsService.getContextWindowByID(model)

    let text = ''
    multiplexer.sub(SMART_APPLY_TOPICS.REPLACE.toString(), {
        onResponse: async (content: string) => {
            text += content
        },
        onTurnComplete: async () => {
            Promise.resolve(text)
        },
    })

    const abortController = new AbortController()
    const { prefix, messages } = await getPrompt(instruction, replacement, document, model)
    const stream = client.chat(
        messages,
        {
            model,
            stopSequences: SHARED_PARAMETERS.stopSequences,
            maxTokensToSample: contextWindow.output,
        },
        abortController.signal
    )

    let textConsumed = 0
    for await (const message of stream) {
        switch (message.type) {
            case 'change': {
                if (textConsumed === 0 && prefix) {
                    void multiplexer.publish(prefix)
                }
                const text = message.text.slice(textConsumed)
                textConsumed += text.length
                void multiplexer.publish(text)
                break
            }
            case 'complete': {
                void multiplexer.notifyTurnComplete()
                break
            }
        }
    }

    return text
}

export function getFullRangeofDocument(document: vscode.TextDocument): vscode.Range {
    const endOfDocument = document.lineCount - 1
    const lastLine = document.lineAt(endOfDocument)
    const range = new vscode.Range(0, 0, endOfDocument, lastLine.range.end.character)
    return range
}

interface SmartSelection {
    type: 'insert' | 'selection' | 'entire-file'
    range: vscode.Range
}

export async function getSmartApplySelection(
    instruction: PromptString,
    replacement: PromptString,
    document: vscode.TextDocument,
    model: EditModel,
    client: ChatClient
): Promise<SmartSelection | null> {
    const originalCode = await promptModelForOriginalCode(
        instruction,
        replacement,
        document,
        model,
        client
    )

    if (originalCode.trim().length === 0 || originalCode.trim() === 'INSERT') {
        // Insert flow. Cody thinks that this code should be inserted into the document.
        // Add the code to the end position of the document.
        const range = getFullRangeofDocument(document)
        return {
            type: 'insert',
            range: new vscode.Range(range.end, range.end),
        }
    }

    if (originalCode.trim() === 'ENTIRE_FILE') {
        // Replace flow. Cody thinks that the entire file should be replaced.
        // Replace the entire file.
        // Note: This is essentially a shortcut for a common use case,
        // we don't want Cody to repeat the entire file if we can avoid it.
        const range = new vscode.Range(0, 0, document.lineCount - 1, 0)
        return {
            type: 'entire-file',
            range,
        }
    }

    const fuzzyLocation = fuzzyFindLocation(document, originalCode)
    if (!fuzzyLocation) {
        // Cody told us we need to replace some code, but we couldn't find where to replace it
        // Do nothing.
        // TODO: Should we just insert at the bottom of the file?
        return null
    }

    console.log('got fuzzy location?', fuzzyLocation)

    return {
        type: 'selection',
        range: fuzzyLocation.location.range,
    }
}

export const SMART_APPLY_DECORATION = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor('diffEditor.unchangedCodeBackground'),
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
})
