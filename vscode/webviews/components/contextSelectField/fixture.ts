import type { Context } from './contexts'

export const FIXTURE_CONTEXTS: Context[] = [
    {
        id: '1',
        name: 'global',
        description: 'All repositories',
        query: '',
        default: true,
        starred: false,
    },
    {
        id: '2',
        name: 'openctx-stuff',
        description: 'All OpenCtx-related code',
        query: '(repo:^github\\.com/sourcegraph/cody$ file:openctx) OR (repo:^github\\.com/sourcegraph/openctx$)',
        default: false,
        starred: false,
    },
    {
        id: '3',
        name: 'cody-agent',
        query: 'repo:^github\\.com/sourcegraph/cody$ file:^agent/',
        default: false,
        starred: false,
    },
    {
        id: '4',
        name: 'bazel-examples',
        query: 'repo:^github\\.com/sourcegraph/sourcegraph$ file:BUILD\\.bazel$',
        default: false,
        starred: false,
    },
    {
        id: '5',
        name: 'vite-examples',
        query: 'repo:^github\\.com/sourcegraph/ file:vite(st)?\\.config\\.ts$',
        default: false,
        starred: false,
    },
]
