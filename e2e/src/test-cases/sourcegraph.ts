import { addTestCase } from '.'

addTestCase('Access tokens', {
    codebase: 'github.com/sourcegraph/sourcegraph',
    context: 'embeddings',
    transcript: [
        {
            question: 'How do access tokens work?',
            facts: ['Authorization'],
            answerSummary:
                'Access tokens allow users to make authenticated requests to the API using the `Authorization` header.',
        },
        {
            question: 'Show me an example of using access tokens using Python and requests',
            facts: ['import requests', 'Authorization', 'requests.post', '/.api/graphql'],
            answerSummary:
                'A Python code snippet calling the Sourcegraph API with an access token using the `requests` module.',
        },
    ],
})

addTestCase('Embeddings sub-repo permissions', {
    codebase: 'github.com/sourcegraph/sourcegraph',
    context: 'embeddings',
    transcript: [
        {
            question: 'How are sub-repo permissions respected in the embeddings service?',
            facts: ['are respected', 'authz', 'DefaultSubRepoPermsChecker', 'enterprise/cmd/embeddings/shared/main.go'],
            answerSummary:
                'Sub-repo permissions are respected in the embeddings service by setting `authz.DefaultSubRepoPermsChecker` in `enterprise/cmd/embeddings/shared/main.go`.',
        },
    ],
})

addTestCase('Frontend feature flags', {
    codebase: 'github.com/sourcegraph/sourcegraph',
    context: 'embeddings',
    transcript: [
        {
            question: 'How are feature flags used in sourcegraph frontend?',
            facts: ['useFeatureFlag', 'FeatureFlagName', 'featureFlags.ts', '/site-admin/feature-flags'],
            answerSummary: 'Feature flags allow developers to ship new features that are hidden behind a flag.',
        },
        {
            question: 'How can I add a new one?',
            facts: ['FeatureFlagName'],
            answerSummary: 'Add a new case to the `FeatureFlagName` union type.',
        },
    ],
})

addTestCase('Notebooks', {
    codebase: 'github.com/sourcegraph/sourcegraph',
    context: 'embeddings',
    transcript: [
        {
            question: 'Which blocks do Sourcegraph notebooks support?',
            facts: ['md', 'query', 'file', 'symbol'],
            answerSummary: 'Sourcegraph notebooks support markdown, query, file, symbol, and compute blocks.',
        },
        {
            question: 'How can I add a new type?',
            facts: ['NotebookBlockType'],
            answerSummary: `You will need to:

1. Add a new case to the \`NotebookBlockType\` union type.
2. Add a new React component for rendering the block.
3. Add logic to the notebook editor to handle the new block type.
4. Add the block to the block picker.
5. Add serialization/deserialization for the new block type.
`,
        },
        {
            question: 'What about the backend part?',
            facts: ['schema.graphql', 'resolvers.go'],
            answerSummary:
                'Add the new notebook block type to the GraphQL schema and add block resolvers to the `enterprise/cmd/frontend/internal/notebooks/resolvers/resolvers.go` file.',
        },
    ],
})

addTestCase('InternalDoer', {
    codebase: 'github.com/sourcegraph/sourcegraph',
    context: 'embeddings',
    transcript: [
        {
            question: 'What does InternalDoer do?',
            facts: ['httpcli', 'http'],
            answerSummary:
                'InternalDoer is a shared HTTP client for internal communication. It is a convenience for existing uses of http.DefaultClient.',
        },
    ],
})
