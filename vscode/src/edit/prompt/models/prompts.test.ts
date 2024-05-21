import { describe, expect, it } from 'vitest'

import { isWindows, ps, testFileUri } from '@sourcegraph/cody-shared'

import { document } from '../../../completions/test-helpers'
import type { GetLLMInteractionOptions } from '../type'
import { claude } from './claude'
import { openai } from './openai'

describe('Edit Prompts', () => {
    const followingText = ps`const text = 'Hello, world!'\n`
    const selectedText = ps`return text`
    const precedingText = ps`\n}`
    const uri = testFileUri('src/file/index.ts')
    const fixupTask: GetLLMInteractionOptions = {
        uri,
        followingText,
        selectedText,
        precedingText,
        instruction: ps`Console log text`,
        document: document(
            followingText.toString() + selectedText.toString() + precedingText.toString(),
            'typescript',
            uri.toString()
        ),
    }

    function normalize(text: string): string {
        return isWindows() ? text.replaceAll('src\\file\\index.ts', 'src/file/index.ts') : text
    }

    it.each([
        { name: 'claude', fn: claude },
        { name: 'openai', fn: openai },
    ])('$name builds prompts correctly', ({ fn }) => {
        const { prompt: editPrompt } = fn.getEdit(fixupTask)
        expect(normalize(editPrompt.system?.toString() || '')).toMatchSnapshot('edit.system')
        expect(normalize(editPrompt.instruction?.toString())).toMatchSnapshot('edit.instruction')

        const { prompt: docPrompt } = fn.getDoc(fixupTask)
        expect(normalize(docPrompt.system?.toString() || '')).toMatchSnapshot('doc.system')
        expect(normalize(docPrompt.instruction?.toString())).toMatchSnapshot('doc.instruction')

        const { prompt: addPrompt } = fn.getAdd(fixupTask)
        expect(normalize(addPrompt.system?.toString() || '')).toMatchSnapshot('add.system')
        expect(normalize(addPrompt.instruction?.toString())).toMatchSnapshot('add.instruction')

        const { prompt: fixPrompt } = fn.getFix(fixupTask)
        expect(normalize(fixPrompt.system?.toString() || '')).toMatchSnapshot('fix.system')
        expect(normalize(fixPrompt.instruction?.toString())).toMatchSnapshot('fix.instruction')

        const { prompt: testPrompt } = fn.getTest(fixupTask)
        expect(normalize(testPrompt.system?.toString() || '')).toMatchSnapshot('test.system')
        expect(normalize(testPrompt.instruction?.toString())).toMatchSnapshot('test.instruction')
    })
})
