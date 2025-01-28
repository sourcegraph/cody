import { logDebug } from '@sourcegraph/cody-shared'
import dedent from 'dedent'
import * as vscode from 'vscode'
import { getModelResponse } from '../../autoedits/adapters/utils'

const SMART_APPLY_MODEL = 'accounts/sourcegraph/models/exp-instant-apply-qwen-7b-instruct-ft'

const INSTANT_APPLY_PROMPT = {
    system: 'You are a coding assistant that helps merge code updates, ensuring every modification is fully integrated.',
    instruction: dedent`
    Merge all changes from the <update> snippet into the <code> below.
    - Preserve the code's structure, order, comments, and indentation exactly.
    - Output only the updated code, enclosed within <updated-code> and </updated-code> tags.
    - Do not include any additional text, explanations, placeholders, ellipses, or code fences.

    <code>{originalCode}</code>

    <update>{updatedSnippet}</updated>

    Provide the complete updated code.
    `,
}

interface InstantSmartApplyContext {
    originalCode: string
    updatedSnippet: string
}

function getMessageBody(
    originalCode: string,
    systemMessage: string,
    userMessage: string,
    maxTokens = 4_000,
    userId = '123'
): string {
    const body = {
        stream: false,
        model: SMART_APPLY_MODEL,
        temperature: 0,
        max_tokens: maxTokens,
        response_format: {
            type: 'text',
        },
        // Fireworks Predicted outputs
        // https://docs.fireworks.ai/guides/querying-text-models#predicted-outputs
        // speculation: originalCode,
        prediction: {
            type: 'content',
            content: originalCode,
        },
        rewrite_speculation: true,
        user: userId || undefined,
    }
    const request = {
        ...body,
        messages: [
            {
                role: 'system',
                content: systemMessage,
            },
            {
                role: 'user',
                content: userMessage,
            },
        ],
    }
    return JSON.stringify(request)
}

async function getInstantApplyModelResponse(
    originalCode: string,
    system: string,
    instruction: string
): Promise<string> {
    const body = getMessageBody(originalCode, system, instruction)

    const url = await vscode.workspace
        .getConfiguration()
        .get<string>('cody.experimental.instant-smart-apply-url')

    const apiKey = await vscode.workspace
        .getConfiguration()
        .get<string>('cody.experimental.instant-smart-apply-apiKey')

    if (!url) {
        throw new Error('No URL found')
    }

    if (!apiKey) {
        throw new Error('No API key found')
    }

    const response = await getModelResponse(url, body, apiKey)
    return response.choices[0].message.content
}

export async function getInstantSmartApplyPrompt({
    originalCode,
    updatedSnippet,
}: InstantSmartApplyContext): Promise<string> {
    const systemPrompt = INSTANT_APPLY_PROMPT.system
    const userPrompt = INSTANT_APPLY_PROMPT.instruction
        .replaceAll('{updatedSnippet}', updatedSnippet)
        .replaceAll('{originalCode}', originalCode)

    const startTime = performance.now()
    const response = await getInstantApplyModelResponse(originalCode, systemPrompt, userPrompt)
    const endTime = performance.now()

    logDebug('Instant Smart Apply', 'Prompt', userPrompt)
    logDebug('Instant Smart Apply', 'Response', response)
    logDebug(
        'Instant Smart Apply',
        `Tokens Output: ${response.length / 4}`,
        `Time taken for instant apply model response: ${endTime - startTime}ms`
    )

    const match = response.match(/<updated-code>([\s\S]*?)<\/updated-code>/)
    return match ? match[1].trim() : response
}
