import { PROMPT_TOPICS } from '../prompt/constants'

interface ResponseTestFixture {
    response: string
    expected: string
}

const CLEAN_RESPONSE = `export function logDebug<T extends string>(filterLabel: string, text: string, ...args: unknown[]): void {
    log<T>('error', filterLabel, text, ...args)
}`

export const RESPONSE_TEST_FIXTURES: Record<string, ResponseTestFixture> = {
    clean: {
        response: CLEAN_RESPONSE,
        expected: CLEAN_RESPONSE,
    },
    withTags: {
        response: `<${PROMPT_TOPICS.OUTPUT}>` + CLEAN_RESPONSE + `</${PROMPT_TOPICS.OUTPUT}>`,
        expected: CLEAN_RESPONSE,
    },
    withIncorrectNumberedTag: {
        response: '<CODE123>' + CLEAN_RESPONSE + '</CODE789>',
        expected: CLEAN_RESPONSE,
    },
    withMarkdownSyntax: {
        response: '```\n' + CLEAN_RESPONSE + '```',
        expected: CLEAN_RESPONSE,
    },
    withMarkdownSyntaxAndLang: {
        response: '```typescript\n' + CLEAN_RESPONSE + '```',
        expected: CLEAN_RESPONSE,
    },
    withMarkdownSyntaxAndTags: {
        response:
            '```\n' +
            `<${PROMPT_TOPICS.OUTPUT}>` +
            CLEAN_RESPONSE +
            `</${PROMPT_TOPICS.OUTPUT}>` +
            '```',
        expected: CLEAN_RESPONSE,
    },
    withHtmlEntities: {
        response: CLEAN_RESPONSE.replace(/</g, '&lt;').replace(/>/g, '&gt;'),
        expected: CLEAN_RESPONSE,
    },
}
