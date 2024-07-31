import type { Prompt } from '@sourcegraph/cody-shared'

export const FIXTURE_PROMPTS: Prompt[] = [
    {
        id: '1',
        name: 'typescript-vitest-test',
        nameWithOwner: 'alice/typescript-vitest-test',
        owner: { namespaceName: 'alice' },
        description: 'Generate unit tests for a given function',
        draft: false,
        definition: { text: '' },
        url: 'https://example.com',
    },
    {
        id: '2',
        name: 'review-openctx-provider',
        nameWithOwner: 'alice/review-openctx-provider',
        owner: { namespaceName: 'alice' },
        description: 'Suggest improvements for an OpenCtx provider',
        draft: true,
        definition: { text: '' },
        url: 'https://example.com',
    },
    {
        id: '3',
        name: 'generate-junit-integration-test',
        nameWithOwner: 'myorg/generate-junit-integration-test',
        owner: { namespaceName: 'myorg' },
        draft: false,
        definition: { text: '' },
        url: 'https://example.com',
    },
    {
        id: '4',
        name: 'fix-bazel-build-file',
        nameWithOwner: 'myorg/fix-bazel-build-file',
        owner: { namespaceName: 'myorg' },
        draft: false,
        definition: { text: '' },
        url: 'https://example.com',
    },
    {
        id: '5',
        name: 'convert-from-react-class-to-fc',
        nameWithOwner: 'abc-corp/convert-from-react-class-to-fc',
        owner: { namespaceName: 'abc-corp' },
        // Long text to test wrapping.
        description: 'Convert from a React class component to a functional component',
        draft: false,
        definition: { text: '' },
        url: 'https://example.com',
    },
]
