import type { FixupTask } from '../../non-stop/FixupTask'
import { PROMPT_TOPICS } from '../prompt/constants'

interface ResponseTestFixture {
    response: string
    expected: string
    task: FixupTask
}

const CLEAN_RESPONSE = `export function logDebug<T extends string>(filterLabel: string, text: string, ...args: unknown[]): void {
    log<T>('error', filterLabel, text, ...args)
}`

const DEFAULT_TASK = {} as FixupTask

export const RESPONSE_TEST_FIXTURES: Record<string, ResponseTestFixture> = {
    clean: {
        response: CLEAN_RESPONSE,
        expected: CLEAN_RESPONSE,
        task: DEFAULT_TASK,
    },
    withTags: {
        response: `<${PROMPT_TOPICS.OUTPUT}>` + CLEAN_RESPONSE + `</${PROMPT_TOPICS.OUTPUT}>`,
        expected: CLEAN_RESPONSE,
        task: DEFAULT_TASK,
    },
    withIncorrectNumberedTag: {
        response: '<CODE123>' + CLEAN_RESPONSE + '</CODE789>',
        expected: CLEAN_RESPONSE,
        task: DEFAULT_TASK,
    },
    withMarkdownSyntax: {
        response: '```\n' + CLEAN_RESPONSE + '```',
        expected: CLEAN_RESPONSE,
        task: DEFAULT_TASK,
    },
    withMarkdownSyntaxAndLang: {
        response: '```typescript\n' + CLEAN_RESPONSE + '```',
        expected: CLEAN_RESPONSE,
        task: DEFAULT_TASK,
    },
    withMarkdownSyntaxAndTags: {
        response:
            '```\n' +
            `<${PROMPT_TOPICS.OUTPUT}>` +
            CLEAN_RESPONSE +
            `</${PROMPT_TOPICS.OUTPUT}>` +
            '```',
        expected: CLEAN_RESPONSE,
        task: DEFAULT_TASK,
    },
    withHtmlEntities: {
        response: CLEAN_RESPONSE.replace(/</g, '&lt;').replace(/>/g, '&gt;'),
        expected: CLEAN_RESPONSE,
        task: DEFAULT_TASK,
    },
    withLeadingSpaces: {
        response: '   \n\n' + CLEAN_RESPONSE,
        expected: CLEAN_RESPONSE,
        task: DEFAULT_TASK,
    },
    withLeadingSpacesAndAddIntent: {
        response: '   \n\n' + CLEAN_RESPONSE,
        // Leading new lines are valuable information for `add`
        expected: '\n\n' + CLEAN_RESPONSE,
        task: { ...DEFAULT_TASK, intent: 'add' } as FixupTask,
    },
}
