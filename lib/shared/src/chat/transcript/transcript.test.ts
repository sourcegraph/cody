import assert from 'assert'

import { describe, it } from 'vitest'

import { isWindows } from '../../common/platform'
import { MAX_AVAILABLE_PROMPT_LENGTH } from '../../prompt/constants'
import { CODY_INTRO_PROMPT } from '../../prompt/prompt-mixin'
import { type Message } from '../../sourcegraph-api'
import { MockEditor, MockIntentDetector, newChatQuestionContext } from '../../test/mocks'
import { testFileUri } from '../../test/path-helpers'
import { OldChatQuestion } from '../OldChatQuestion'

import { Transcript } from '.'

async function generateLongTranscript(): Promise<{ transcript: Transcript; tokensPerInteraction: number }> {
    // Add enough interactions to exceed the maximum prompt length.
    const numInteractions = 100
    const transcript = new Transcript()
    for (let i = 0; i < numInteractions; i++) {
        const interaction = await new OldChatQuestion(() => {}).getInteraction(
            'ABCD'.repeat(256), // 256 tokens, 1 token is ~4 chars
            newChatQuestionContext()
        )
        transcript.addInteraction(interaction)

        const assistantResponse = 'EFGH'.repeat(256) // 256 tokens
        transcript.addAssistantResponse(assistantResponse)
    }

    return {
        transcript,
        tokensPerInteraction: 512, // 256 for question + 256 for response.
    }
}

describe('Transcript', () => {
    it('generates an empty prompt with no interactions', async () => {
        const transcript = new Transcript()
        const { prompt } = await transcript.getPromptForLastInteraction()
        assert.deepStrictEqual(normalizeMessagesPathSep(prompt), [])
    })

    it('generates a prompt without context for a chat question', async () => {
        const interaction = await new OldChatQuestion(() => {}).getInteraction(
            'how do access tokens work in sourcegraph',
            newChatQuestionContext()
        )

        const transcript = new Transcript()
        transcript.addInteraction(interaction)

        const { prompt } = await transcript.getPromptForLastInteraction()
        const expectedPrompt = [
            { speaker: 'human', text: CODY_INTRO_PROMPT + 'how do access tokens work in sourcegraph' },
            { speaker: 'assistant', text: undefined },
        ]
        assert.deepStrictEqual(normalizeMessagesPathSep(prompt), expectedPrompt)
    })

    it('should limit prompts to a maximum number of tokens', async () => {
        const { transcript, tokensPerInteraction } = await generateLongTranscript()

        const numExpectedInteractions = Math.floor(MAX_AVAILABLE_PROMPT_LENGTH / tokensPerInteraction)
        const numExpectedMessages = numExpectedInteractions * 2 // Each interaction has two messages.

        const { prompt } = await transcript.getPromptForLastInteraction()
        assert.deepStrictEqual(normalizeMessagesPathSep(prompt).length, numExpectedMessages)
    })

    it('should limit prompts to a maximum number of tokens with preamble always included', async () => {
        const { transcript, tokensPerInteraction } = await generateLongTranscript()

        const preamble: Message[] = [
            { speaker: 'human', text: 'PREA'.repeat(tokensPerInteraction / 2) },
            { speaker: 'assistant', text: 'MBLE'.repeat(tokensPerInteraction / 2) },
            { speaker: 'human', text: 'PREA'.repeat(tokensPerInteraction / 2) },
            { speaker: 'assistant', text: 'MBLE'.repeat(tokensPerInteraction / 2) },
        ]

        const numExpectedInteractions = Math.floor(MAX_AVAILABLE_PROMPT_LENGTH / tokensPerInteraction)
        const numExpectedMessages = numExpectedInteractions * 2 // Each interaction has two messages.

        const { prompt } = await transcript.getPromptForLastInteraction(preamble)
        assert.deepStrictEqual(normalizeMessagesPathSep(prompt).length, numExpectedMessages)
        assert.deepStrictEqual(preamble, prompt.slice(0, 4))
    })

    it('does not include currently visible content from the editor if no codebase context is required', async () => {
        const editor = new MockEditor({
            getActiveTextEditorVisibleContent: () => ({
                fileUri: testFileUri('internal/lib.go'),
                content: 'package lib',
            }),
        })
        const intentDetector = new MockIntentDetector({})

        const transcript = new Transcript()
        const interaction = await new OldChatQuestion(() => {}).getInteraction(
            'how do access tokens work in sourcegraph',
            newChatQuestionContext({
                editor,
                intentDetector,
            })
        )
        transcript.addInteraction(interaction)

        const { prompt } = await transcript.getPromptForLastInteraction()
        const expectedPrompt = [
            { speaker: 'human', text: CODY_INTRO_PROMPT + 'how do access tokens work in sourcegraph' },
            { speaker: 'assistant', text: undefined },
        ]
        assert.deepStrictEqual(normalizeMessagesPathSep(prompt), expectedPrompt)
    })
})

const SEP = isWindows() ? '\\' : '/'

function normalizeMessagesPathSep(messages: Message[]): Message[] {
    for (const m of messages) {
        if (m.text) {
            m.text = m.text.replaceAll(SEP, '/')
        }
    }
    return messages
}
