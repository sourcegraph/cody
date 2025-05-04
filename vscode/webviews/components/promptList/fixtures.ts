import {
    type Action,
    type CodyCommand,
    CustomCommandType,
    type Prompt,
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
        mode: 'edit',
    },
    {
        key: 'doc',
        description: 'Document Code',
        prompt: '',
        mode: 'edit',
        type: 'default',
    },
    {
        key: 'explain',
        description: 'Explain Code',
        prompt: '',
        mode: 'ask',
        type: 'default',
    },
    {
        key: 'test',
        description: 'Generate Unit Tests',
        prompt: '',
        mode: 'ask',
        type: 'default',
    },
    {
        key: 'smell',
        description: 'Find Code Smells',
        prompt: '',
        mode: 'ask',
        type: 'default',
    },
    {
        key: 'convert-python-3',
        prompt: 'Convert from Python 3 to...',
        description: 'Convert Python 3 code to...',
        mode: 'ask',
        type: CustomCommandType.User,
    },
    {
        key: 'pre-review-backend',
        prompt: 'Pre-review...',
        description: 'Backend code change pre-review',
        mode: 'ask',
        type: CustomCommandType.Workspace,
    },
    {
        key: 'migrate-to-new-api',
        prompt: 'Migrate...',
        mode: 'ask',
        type: CustomCommandType.Workspace,
    },
]

/**
 * For testing only.
 */
export function makePromptsAPIWithData(data: {
    arePromptsSupported?: boolean
    prompts: Prompt[]
    commands?: CodyCommand[]
}): WebviewToExtensionAPI['prompts'] {
    return input =>
        promiseFactoryToObservable<PromptsResult>(async () => {
            const { query } = input
            const { arePromptsSupported = true, prompts, commands = [] } = data
            await new Promise<void>(resolve => setTimeout(resolve, 500))

            const queryLower = query.toLowerCase()
            function matchQuery(text: string): boolean {
                return text.toLowerCase().includes(queryLower)
            }

            return {
                query,
                arePromptsSupported,
                actions: [
                    ...prompts
                        .filter(prompt => matchQuery(prompt.name))
                        .map<Action>(prompt => ({ ...prompt, actionType: 'prompt' })),

                    ...commands
                        .filter(c => matchQuery(c.key))
                        .map<Action>(prompt => ({ ...prompt, actionType: 'command' })),
                ],
            } satisfies PromptsResult
        })
}
