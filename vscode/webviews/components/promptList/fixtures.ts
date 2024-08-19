import {
    type CodyCommand,
    CustomCommandType,
    type PromptsResult,
    type WebviewToExtensionAPI,
    promiseFactoryToObservable,
} from '@sourcegraph/cody-shared'

export const FIXTURE_COMMANDS: CodyCommand[] = [
    {
        key: 'edit',
        description: 'Edit Code',
        prompt: '',
        type: 'default',
    },
    {
        key: 'doc',
        description: 'Document Code',
        prompt: '',
        type: 'default',
    },
    {
        key: 'explain',
        description: 'Explain Code',
        prompt: '',
        type: 'default',
    },
    {
        key: 'test',
        description: 'Generate Unit Tests',
        prompt: '',
        type: 'default',
    },
    {
        key: 'smell',
        description: 'Find Code Smells',
        prompt: '',
        type: 'default',
    },
    {
        key: 'convert-python-3',
        prompt: 'Convert from Python 3 to...',
        description: 'Convert Python 3 code to...',
        type: CustomCommandType.User,
    },
    {
        key: 'pre-review-backend',
        prompt: 'Pre-review...',
        description: 'Backend code change pre-review',
        type: CustomCommandType.Workspace,
    },
    {
        key: 'migrate-to-new-api',
        prompt: 'Migrate...',
        type: CustomCommandType.Workspace,
    },
]

/**
 * For testing only.
 */
export function makePromptsAPIWithData(
    data: Omit<PromptsResult, 'query'>
): WebviewToExtensionAPI['prompts'] {
    return query =>
        promiseFactoryToObservable<PromptsResult>(async () => {
            await new Promise<void>(resolve => setTimeout(resolve, 500))

            const queryLower = query.toLowerCase()
            function matchQuery(text: string): boolean {
                return text.toLowerCase().includes(queryLower)
            }

            return {
                prompts:
                    data.prompts.type === 'results'
                        ? {
                              type: 'results',
                              results: data.prompts.results.filter(prompt => matchQuery(prompt.name)),
                          }
                        : data.prompts,
                commands: data.commands?.filter(c => matchQuery(c.key)),
                query,
            } satisfies PromptsResult
        })
}
