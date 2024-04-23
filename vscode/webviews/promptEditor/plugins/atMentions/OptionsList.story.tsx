import type { Meta, StoryObj } from '@storybook/react'
import { URI } from 'vscode-uri'

import type { ContextItem } from '@sourcegraph/cody-shared'
import { VSCodeDecorator } from '../../../storybook/VSCodeStoryDecorator'
import { OptionsList } from './OptionsList'
import { MentionTypeaheadOption } from './atMentions'

const meta: Meta<typeof OptionsList> = {
    title: 'cody/OptionsList',
    component: OptionsList,

    args: {
        trigger: '@',
        query: '',
        options: [],
        selectedIndex: null,
        selectOptionAndCleanUp: () => {},
        setHighlightedIndex: () => {},
    } satisfies React.ComponentProps<typeof OptionsList>,

    decorators: [
        VSCodeDecorator(undefined, {
            maxWidth: '300px',
            border: 'solid 1px var(--vscode-dropdown-border)',
        }),
    ],
}

export default meta

function toOptions(items: ContextItem[]): MentionTypeaheadOption[] {
    return items.map(item => new MentionTypeaheadOption(item))
}

export const FileSearchEmpty: StoryObj<typeof OptionsList> = {
    args: {
        query: '',
        options: toOptions([]),
    },
}

export const FileSearchNoMatches: StoryObj<typeof OptionsList> = {
    args: {
        query: 'missing',
        options: toOptions([]),
    },
}

export const FileSearchMatches: StoryObj<typeof OptionsList> = {
    args: {
        query: 'd',
        options: toOptions([
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

export const FileSearchTooLarge: StoryObj<typeof OptionsList> = {
    args: {
        query: 'd',
        options: toOptions([
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

export const LongScrolling: StoryObj<typeof OptionsList> = {
    args: {
        query: 'd',
        options: toOptions(
            Array.from(new Array(20).keys()).map(i => ({
                uri: URI.file(`${i ? `${'dir/'.repeat(i + 1)}` : ''}file-${i}.py`),
                type: 'file',
            }))
        ),
    },
}

export const SymbolSearchNoMatchesWarning: StoryObj<typeof OptionsList> = {
    args: {
        query: '#a',
        options: toOptions([]),
    },
}

export const SymbolSearchNoMatches: StoryObj<typeof OptionsList> = {
    args: {
        query: '#abcdefg',
        options: toOptions([]),
    },
}

export const SymbolSearchMatches: StoryObj<typeof OptionsList> = {
    args: {
        query: '#login',
        options: toOptions([
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
