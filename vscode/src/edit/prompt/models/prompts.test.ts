import { describe, expect, it } from 'vitest'

import { isWindows, testFileUri } from '@sourcegraph/cody-shared'

import { document } from '../../../completions/test-helpers'
import type { GetLLMInteractionOptions } from '../type'
import { claude } from './claude'
import { openai } from './openai'

describe('Edit Prompts', () => {
    const followingText = "const text = 'Hello, world!'\n"
    const selectedText = 'return text'
    const precedingText = '\n}'
    const uri = testFileUri('src/file/index.ts')
    const fixupTask: GetLLMInteractionOptions = {
        uri,
        followingText,
        selectedText,
        precedingText,
        instruction: 'Console log text',
        document: document(followingText + selectedText + precedingText, 'typescript', uri.toString()),
    }

    function normalize(text: string): string {
        return isWindows() ? text.replaceAll('src\\file\\index.ts', 'src/file/index.ts') : text
    }

    it.each([
        { name: 'claude', fn: claude },
        { name: 'openai', fn: openai },
    ])('$name builds prompts correctly', ({ fn }) => {
        const { prompt: editPrompt } = fn.getEdit(fixupTask)
        expect(normalize(editPrompt.system || '')).toMatchSnapshot('edit.system')
        expect(normalize(editPrompt.instruction)).toMatchSnapshot('edit.instruction')

        const { prompt: docPrompt } = fn.getDoc(fixupTask)
        expect(normalize(docPrompt.system || '')).toMatchSnapshot('doc.system')
        expect(normalize(docPrompt.instruction)).toMatchSnapshot('doc.instruction')

        const { prompt: addPrompt } = fn.getAdd(fixupTask)
        expect(normalize(addPrompt.system || '')).toMatchSnapshot('add.system')
        expect(normalize(addPrompt.instruction)).toMatchSnapshot('add.instruction')

        const { prompt: fixPrompt } = fn.getFix(fixupTask)
        expect(normalize(fixPrompt.system || '')).toMatchSnapshot('fix.system')
        expect(normalize(fixPrompt.instruction)).toMatchSnapshot('fix.instruction')

        const { prompt: testPrompt } = fn.getTest(fixupTask)
        expect(normalize(testPrompt.system || '')).toMatchSnapshot('test.system')
        expect(normalize(testPrompt.instruction)).toMatchSnapshot('test.instruction')
    })
})
