import type { Meta, StoryObj } from '@storybook/react'
import { URI } from 'vscode-uri'

import {
    type ContextItem,
    type ContextItemOpenCtx,
    ContextItemSource,
    type ContextMentionProviderMetadata,
    FILE_CONTEXT_MENTION_PROVIDER,
    type MentionMenuData,
    SYMBOL_CONTEXT_MENTION_PROVIDER,
    openCtxProviderMetadata,
} from '@sourcegraph/cody-shared'
import { MentionMenu, type MentionMenuParams } from '@sourcegraph/prompt-editor'
import { VSCodeDecorator } from '../storybook/VSCodeStoryDecorator'

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
            <div style={{ margin: '20px' }}>
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
        items,
        providers,
    }
}

export const Default: StoryObj<typeof MentionMenu> = {
    args: {
        params: toParams(''),
        data: toData(
            [
                {
                    type: 'tree',
                    isWorkspaceRoot: true,
                    name: 'my-repo',
                    description: 'my-repo',
                    title: 'Current Repository',
                    source: ContextItemSource.Initial,
                    content: null,
                    uri: URI.file('a/b'),
                    icon: 'folder',
                },
                {
                    uri: URI.file('a/b/initial.go'),
                    type: 'file',
                    description: 'initial.go:8-13',
                    title: 'Current Selection',
                    source: ContextItemSource.Initial,
                    range: { start: { line: 7, character: 5 }, end: { line: 12, character: 9 } },
                    icon: 'list-selection',
                },
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
            ],
            [FILE_CONTEXT_MENTION_PROVIDER, SYMBOL_CONTEXT_MENTION_PROVIDER]
        ),
    },
}

export const WithError: StoryObj<typeof MentionMenu> = {
    args: {
        params: toParams('', undefined),
        data: { ...toData([{ uri: URI.file('a/b/c.go'), type: 'file' }]), error: 'my error' },
    },
}

export const LoadingNoProvider: StoryObj<typeof MentionMenu> = {
    args: {
        params: toParams('', undefined),
        data: toData(undefined),
    },
}

export const LoadingSingleProvider: StoryObj<typeof MentionMenu> = {
    args: {
        params: toParams('', FILE_CONTEXT_MENTION_PROVIDER),
        data: toData(undefined),
    },
}

export const FileSearchNoQueryNoMatches: StoryObj<typeof MentionMenu> = {
    args: {
        params: toParams('', FILE_CONTEXT_MENTION_PROVIDER),
        data: toData([]),
    },
}

export const FileSearchNoQueryMatches: StoryObj<typeof MentionMenu> = {
    args: {
        params: toParams('', FILE_CONTEXT_MENTION_PROVIDER),
        data: toData([{ uri: URI.file('a/b/ddddddd.go'), type: 'file' }]),
    },
}

export const FileSearchNoMatches: StoryObj<typeof MentionMenu> = {
    args: {
        params: toParams('missing', FILE_CONTEXT_MENTION_PROVIDER),
        data: toData([]),
    },
}

export const FileSearchSuggested: StoryObj<typeof MentionMenu> = {
    args: {
        params: toParams('', FILE_CONTEXT_MENTION_PROVIDER),
        data: toData([
            { uri: URI.file('a/b/ddddddd.go'), type: 'file' },
            {
                uri: URI.file('a/b/x.go'),
                type: 'file',
                range: { start: { line: 3, character: 5 }, end: { line: 7, character: 9 } },
            },
        ]),
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

export const FileSearchTooLargePartiallyInserted: StoryObj<typeof MentionMenu> = {
    args: {
        params: toParams('my/file.go:', FILE_CONTEXT_MENTION_PROVIDER),
        data: toData([{ uri: URI.file('my/file.go'), type: 'file', isTooLarge: true }]),
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

const OPENCTX_PROVIDER = openCtxProviderMetadata({
    providerUri: 'https://openctx.org/npm/@openctx/provider-example',
    name: 'OpenCtx Example Title',
    mentions: {
        label: 'Search label for OpenCtx Example...',
    },
})

function openCtxStory(query: string, names: string[] | undefined): StoryObj<typeof MentionMenu> {
    const items =
        names === undefined
            ? undefined
            : names.map(
                  name =>
                      ({
                          type: 'openctx',
                          provider: 'openctx',
                          title: name,
                          uri: URI.parse('https://example.com').with({ query: name }),
                          providerUri: OPENCTX_PROVIDER.id,
                          mention: {
                              uri: '',
                              description: 'openctx description ' + name,
                          },
                      }) satisfies ContextItemOpenCtx
              )
    return {
        args: {
            params: {
                query: query,
                parentItem: OPENCTX_PROVIDER,
            },
            data: {
                providers: [],
                items,
            },
        },
    }
}

export const OpenctxNoQueryLoading: StoryObj<typeof MentionMenu> = openCtxStory('', undefined)
export const OpenctxNoQueryNoMatches: StoryObj<typeof MentionMenu> = openCtxStory('', [])
export const OpenctxNoQueryMatches: StoryObj<typeof MentionMenu> = openCtxStory('', ['a', 'b', 'c'])
export const OpenctxNoMatches: StoryObj<typeof MentionMenu> = openCtxStory('missing', [])
export const OpenctxMatches: StoryObj<typeof MentionMenu> = openCtxStory('b', ['a', 'b', 'c'])
