import { describe, expect, it } from 'vitest'

import { detectFilePaths, detectSymbols, removeCodeBlocks } from './entity-detection'

const answer = `Based on the code snippet you provided from \`internal/httpcli/client.go\` in the \`github.com/sourcegraph/sourcegraph\` repository, \`InternalDoer\` is a convenience variable that provides a shared \`Doer\` instance for making HTTP requests.

The \`Doer\` interface in \`internal/httpcli\` wraps an \`http.Client\` to provide additional middleware and logging. So \`InternalDoer\` is a pre-configured \`Doer\` that can be used for internal HTTP requests instead of using the default \`http.DefaultClient\`.

Some key points:

- \`InternalDoer\` is a package-level variable that is initialized with a \`Doer\` from the \`InternalClientFactory\`
- It has middleware and options applied based on \`InternalClientFactory\`
- It provides a shared instance for convenience instead of creating a new \`Doer\` every time
- Using \`InternalDoer\` instead of \`http.DefaultClient\` gives additional middleware and logging

So in summary, \`InternalDoer\` provides a shared, pre-configured \`Doer\` for internal HTTP requests in Sourcegraph.

There are monitoring dashboards defined for tracking backend performance (see monitoring/definitions/frontend.go).

Tokens can be created with different scopes/permissions depending on how they will be used.`

describe('detectFilePaths', () => {
    it('should detect file paths', () => {
        expect(detectFilePaths(answer)).toStrictEqual([
            { type: 'path', value: 'internal/httpcli/client.go' },
            { type: 'path', value: 'internal/httpcli' },
            { type: 'path', value: 'monitoring/definitions/frontend.go' },
        ])
    })
})

describe('detectSymbols', () => {
    it('should detect symbols', () => {
        expect(detectSymbols(answer)).toStrictEqual([
            {
                type: 'symbol',
                value: 'InternalDoer',
            },
            {
                type: 'symbol',
                value: 'Doer',
            },
            {
                type: 'symbol',
                value: 'http',
            },
            {
                type: 'symbol',
                value: 'Client',
            },
            {
                type: 'symbol',
                value: 'DefaultClient',
            },
            {
                type: 'symbol',
                value: 'InternalClientFactory',
            },
        ])
    })
})

describe('removeCodeBlocks', () => {
    it('should remove code blocks', () => {
        const text = `Hello
\`\`\`
code block
\`\`\`
to the
\`\`\`python
code block
\`\`\`
World!`
        const result = removeCodeBlocks(text)
        expect(result).toEqual('Hello\nto the\nWorld!')
    })
})
