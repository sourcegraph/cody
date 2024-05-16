import type { Meta, StoryObj } from '@storybook/react'
import { URI } from 'vscode-uri'

import {
    type ContextItem,
    ContextItemSource,
    type ContextMentionProviderMetadata,
    FILE_CONTEXT_MENTION_PROVIDER,
    GITHUB_CONTEXT_MENTION_PROVIDER,
    PACKAGE_CONTEXT_MENTION_PROVIDER,
    SYMBOL_CONTEXT_MENTION_PROVIDER,
    URL_CONTEXT_MENTION_PROVIDER,
    allMentionProvidersMetadata,
} from '@sourcegraph/cody-shared'
import { VSCodeDecorator } from '../../storybook/VSCodeStoryDecorator'
import { MentionMenu } from './MentionMenu'
import type { MentionMenuData, MentionMenuParams } from './useMentionMenuData'

const meta: Meta<typeof MentionMenu> = {
    title: 'cody/MentionMenu',
    component: MentionMenu,

    args: {
        params: toParams(''),
        selectOptionAndCleanUp: () => {},
    },

    // Render something that looks like the editor to make the storybook look nicer.
    render: args => {
        return (
            <div>
                <div
                    style={{
                        border: 'solid 1px var(--vscode-input-border)',
                        backgroundColor: 'var(--vscode-input-background)',
                        padding: '5px',
                        marginBottom: '10px',
                    }}
                >
                    hello @{args.params.query}▎
                </div>
                <MentionMenu {...args} __storybook__focus={true} />
            </div>
        )
    },

    decorators: [
        VSCodeDecorator(undefined, {
            maxWidth: '400px',
        }),
    ],
}

export default meta

function toParams(query: string, parentItem?: ContextMentionProviderMetadata): MentionMenuParams {
    return { query, parentItem: parentItem ?? null }
}

function toData(
    items: ContextItem[] | undefined,
    providers: ContextMentionProviderMetadata[] = []
): MentionMenuData {
    return {
        providers,
        items,
    }
}

export const Default: StoryObj<typeof MentionMenu> = {
    args: {
        params: toParams(''),
        data: toData(
            [
                {
                    uri: URI.file('a/b/x.go'),
                    type: 'file',
                },
                {
                    uri: URI.file('a/b/foo.go'),
                    type: 'file',
                    range: { start: { line: 3, character: 5 }, end: { line: 7, character: 9 } },
                },
                {
                    symbolName: 'LoginDialog',
                    type: 'symbol',
                    kind: 'class',
                    uri: URI.file('/lib/src/LoginDialog.tsx'),
                },
                {
                    symbolName: 'login',
                    type: 'symbol',
                    kind: 'function',
                    uri: URI.file('/src/login.go'),
                    range: { start: { line: 42, character: 1 }, end: { line: 44, character: 1 } },
                },
                {
                    symbolName: 'handleLogin',
                    type: 'symbol',
                    kind: 'method',
                    uri: URI.file(`/${'sub-dir/'.repeat(50)}/}/src/LoginDialog.tsx`),
                },
                {
                    type: 'file',
                    uri: URI.parse('https://example.com/foo'),
                    title: 'Foo - Example',
                    provider: URL_CONTEXT_MENTION_PROVIDER.id,
                },
                {
                    type: 'package',
                    ecosystem: 'npm',
                    name: '@lexical/editor',
                    source: ContextItemSource.Package,
                    provider: PACKAGE_CONTEXT_MENTION_PROVIDER.id,
                    uri: URI.parse('https://sourcegraph.com/npm/lexical/editor'),
                    repoID: '1',
                    title: '@lexical/editor',
                },
                {
                    type: 'github_issue',
                    source: ContextItemSource.Github,
                    provider: GITHUB_CONTEXT_MENTION_PROVIDER.id,
                    uri: URI.parse('https://github.com/pacocoursey/cmdk/issues/252'),
                    title: '#252 Selected item does not scroll into view',
                    issueNumber: 252,
                    repoName: 'pacocoursey/cmdk',
                    owner: 'pacocoursey',
                },
                {
                    type: 'github_pull_request',
                    source: ContextItemSource.Github,
                    provider: GITHUB_CONTEXT_MENTION_PROVIDER.id,
                    uri: URI.parse('https://github.com/sourcegraph/cody/pull/4050'),
                    title: '#4050 use clsx instead of classnames',
                    pullNumber: 4050,
                    repoName: 'sourcegraph/cody',
                    owner: 'sourcegraph',
                },
            ],
            allMentionProvidersMetadata()
        ),
    },
}

export const WithExperimentalProviders: StoryObj<typeof MentionMenu> = {
    args: {
        params: toParams(''),
        data: toData(
            [
                {
                    uri: URI.file('a/b/x.go'),
                    type: 'file',
                },
                {
                    uri: URI.file('a/b/foo.go'),
                    type: 'file',
                    range: { start: { line: 3, character: 5 }, end: { line: 7, character: 9 } },
                },
            ],
            allMentionProvidersMetadata(true)
        ),
    },
}

export const Loading: StoryObj<typeof MentionMenu> = {
    args: {
        params: toParams('', FILE_CONTEXT_MENTION_PROVIDER),
        data: toData(undefined),
    },
}

export const FileSearchNoMatches: StoryObj<typeof MentionMenu> = {
    args: {
        params: toParams('missing', FILE_CONTEXT_MENTION_PROVIDER),
        data: toData([]),
    },
}

export const FileSearchMatches: StoryObj<typeof MentionMenu> = {
    args: {
        params: toParams('d', FILE_CONTEXT_MENTION_PROVIDER),
        data: toData([
            { uri: URI.file('a/b/ddddddd.go'), type: 'file' },
            {
                uri: URI.file('a/b/x.go'),
                type: 'file',
                range: { start: { line: 3, character: 5 }, end: { line: 7, character: 9 } },
            },
            ...Array.from(new Array(10).keys()).map(
                i =>
                    ({
                        uri: URI.file(`${i ? `${'sub-dir/'.repeat(i * 5)}/` : ''}file-${i}.py`),
                        type: 'file',
                    }) satisfies ContextItem
            ),
        ]),
    },
}

export const FileSearchTooLarge: StoryObj<typeof MentionMenu> = {
    args: {
        params: toParams('d', FILE_CONTEXT_MENTION_PROVIDER),
        data: toData([
            { uri: URI.file('a/b/c.go'), type: 'file' },
            { uri: URI.file('a/b/ddddddd.go'), type: 'file', isTooLarge: true },
            {
                uri: URI.file('aaaaaaaaaa/bbbbbbbbb/cccccccccc/eeeeeeeeee/ddddddd.go'),
                type: 'file',
                isTooLarge: true,
            },
        ]),
    },
}

export const FileSearchIgnored: StoryObj<typeof MentionMenu> = {
    args: {
        params: toParams('d', FILE_CONTEXT_MENTION_PROVIDER),
        data: toData([
            { uri: URI.file('a/b/c.go'), type: 'file' },
            {
                uri: URI.file('a/b/ddddddd.go'),
                type: 'file',
                isIgnored: true,
            },
        ]),
    },
}

export const LongScrolling: StoryObj<typeof MentionMenu> = {
    args: {
        params: toParams('d', FILE_CONTEXT_MENTION_PROVIDER),
        data: toData(
            Array.from(new Array(20).keys()).map(i => ({
                uri: URI.file(`${i ? `${'dir/'.repeat(i + 1)}` : ''}file-${i}.py`),
                type: 'file',
            }))
        ),
    },
}

export const SymbolSearchNoMatchesWarning: StoryObj<typeof MentionMenu> = {
    args: {
        params: toParams('#a', SYMBOL_CONTEXT_MENTION_PROVIDER),
        data: toData([]),
    },
}

export const SymbolSearchNoMatches: StoryObj<typeof MentionMenu> = {
    args: {
        params: toParams('#abcdefg', SYMBOL_CONTEXT_MENTION_PROVIDER),
        data: toData([]),
    },
}

export const SymbolSearchMatches: StoryObj<typeof MentionMenu> = {
    args: {
        params: toParams('#login', SYMBOL_CONTEXT_MENTION_PROVIDER),
        data: toData([
            {
                symbolName: 'LoginDialog',
                type: 'symbol',
                kind: 'class',
                uri: URI.file('/lib/src/LoginDialog.tsx'),
            },
            {
                symbolName: 'login',
                type: 'symbol',
                kind: 'function',
                uri: URI.file('/src/login.go'),
                range: { start: { line: 42, character: 1 }, end: { line: 44, character: 1 } },
            },
            {
                symbolName: 'handleLogin',
                type: 'symbol',
                kind: 'method',
                uri: URI.file(`/${'sub-dir/'.repeat(50)}/}/src/LoginDialog.tsx`),
            },
            {
                symbolName: 'handleLogin',
                type: 'symbol',
                kind: 'method',
                uri: URI.file(`/${'sub-dir/'.repeat(50)}/}/src/LoginDialog.tsx`),
            },
            {
                symbolName: 'handleLogin',
                type: 'symbol',
                kind: 'method',
                uri: URI.file(`/${'sub-dir/'.repeat(50)}/}/src/LoginDialog.tsx`),
            },
            {
                symbolName: 'handleLogin',
                type: 'symbol',
                kind: 'method',
                uri: URI.file(`/${'sub-dir/'.repeat(50)}/}/src/LoginDialog.tsx`),
            },
            {
                symbolName: 'handleLogin',
                type: 'symbol',
                kind: 'method',
                uri: URI.file(`/${'sub-dir/'.repeat(50)}/}/src/LoginDialog.tsx`),
            },
        ]),
    },
}
