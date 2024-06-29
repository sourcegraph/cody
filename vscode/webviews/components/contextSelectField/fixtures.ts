import type { Context } from '@sourcegraph/cody-shared'

export const FIXTURE_CONTEXTS: Context[] = [
    {
        id: '1',
        name: 'global',
        description: 'All repositories',
        spec: 'global',
        query: '',
        default: true,
        starred: false,
    },
    {
        id: '2',
        name: 'openctx-stuff',
        description: 'All OpenCtx-related code',
        spec: '@sqs/openctx-stuff',
        query: '(repo:^github\\.com/sourcegraph/cody$ file:openctx) OR (repo:^github\\.com/sourcegraph/openctx$)',
        default: false,
        starred: false,
    },
    {
        id: '3',
        name: 'cody-agent',
        spec: '@sourcegraph/cody-agent',
        query: 'repo:^github\\.com/sourcegraph/cody$ file:^agent/',
        default: false,
        starred: false,
    },
    {
        id: '4',
        name: 'bazel-examples',
        spec: '@sourcegraph/bazel-examples',
        query: 'repo:^github\\.com/sourcegraph/sourcegraph$ file:BUILD\\.bazel$',
        default: false,
        starred: false,
    },
    {
        id: '5',
        name: 'vite-examples',
        // Long text to test wrapping.
        description:
            'Some examples of Vite configs. Some examples of Vite configs. Some examples of Vite configs. Some examples of Vite configs. ',
        spec: '@sourcegraph/vite-examples',
        query: 'repo:^github\\.com/sourcegraph/ file:vite(st)?\\.config\\.ts$',
        default: false,
        starred: false,
    },
]
