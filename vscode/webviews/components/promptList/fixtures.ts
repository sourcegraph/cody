import {
    type CodyCommand,
    CustomCommandType,
    type PromptsResult,
    type WebviewToExtensionAPI,
    promiseFactoryToObservable,
    type Prompt
} from '@sourcegraph/cody-shared'

export const FIXTURE_PROMPTS: Prompt[] = [
    {
        id: '1',
        name: 'TypeScript Vitest Test',
        nameWithOwner: 'alice/TypeScript Vitest Test',
        owner: { namespaceName: 'alice', displayName: 'Alice Zhao' },
        description: 'Generate unit tests for a given function',
        draft: false,
        definition: { text: 'Generate unit tests for vitest' },
        url: 'https://example.com',
    },
    {
        id: '2',
        name: 'Review OpenCtx Provider',
        nameWithOwner: 'alice/Review OpenCtx Provider',
        owner: { namespaceName: 'alice', displayName: 'Alice Zhao' },
        description: 'Suggest improvements for an OpenCtx provider',
        draft: true,
        definition: { text: 'Review the following OpenCtx provider code' },
        url: 'https://example.com',
    },
    {
        id: '3',
        name: 'Generate JUnit Integration Test',
        nameWithOwner: 'myorg/Generate JUnit Integration Test',
        owner: { namespaceName: 'myorg', displayName: 'My Org' },
        draft: false,
        definition: { text: 'Generate a JUnit integration test' },
        url: 'https://example.com',
    },
    {
        id: '4',
        name: 'Fix Bazel Build File',
        nameWithOwner: 'myorg/Fix Bazel Build File',
        owner: { namespaceName: 'myorg', displayName: 'My Org' },
        draft: false,
        definition: { text: 'Fix common issues in this Bazel BUILD file' },
        url: 'https://example.com',
    },
    {
        id: '5',
        name: 'Convert from React Class to Function Component',
        nameWithOwner: 'abc-corp/Convert from React Class to Function Component',
        owner: { namespaceName: 'abc-corp', displayName: 'ABC Corp' },
        description: 'Convert from a React class component to a function component',
        draft: false,
        definition: { text: 'Convert from a React class component to a function component' },
        url: 'https://example.com',
    },
]

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
