import { type Meta, type StoryObj } from '@storybook/react'
import { URI } from 'vscode-uri'

import { VSCodeStoryDecorator } from './storybook/VSCodeStoryDecorator'
import { UserContextSelectorComponent } from './UserContextSelector'

const meta: Meta<typeof UserContextSelectorComponent> = {
    title: 'cody/User Context Selector',
    component: UserContextSelectorComponent,
    decorators: [
        VSCodeStoryDecorator,
        Story => {
            return (
                <div style={{ position: 'absolute', bottom: 0 }}>
                    <Story />
                </div>
            )
        },
    ],
    argTypes: {
        onSelected: { action: 'selected' },
        setSelectedChatContext: { action: 'setSelectedChatContext' },
    },
}

export default meta

export const FileSearchEmpty: StoryObj<typeof UserContextSelectorComponent> = {
    args: {
        contextSelection: undefined,
        selected: 0,
        formInput: '@',
    },
}

export const FileSearchNoMatches: StoryObj<typeof UserContextSelectorComponent> = {
    args: {
        contextSelection: [],
        selected: 0,
        formInput: '@missing',
    },
}

export const FileSearchMatches: StoryObj<typeof UserContextSelectorComponent> = {
    args: {
        // Long enough to test text-overflow
        contextSelection: Array.from(new Array(20).keys()).map(i => ({
            uri: URI.file(`${i ? 'sub-dir/'.repeat(i * 5) + '/' : ''}file-${i}.py`),
            type: 'file',
        })),
        selected: 0,
        formInput: '@file',
    },
}

export const SymbolSearchNoMatchesWarning: StoryObj<typeof UserContextSelectorComponent> = {
    args: {
        contextSelection: [],
        selected: 0,
        formInput: '@#a',
    },
}

export const SymbolSearchMatches: StoryObj<typeof UserContextSelectorComponent> = {
    args: {
        contextSelection: [
            { symbolName: 'LoginDialog', type: 'symbol', kind: 'class', uri: URI.file('/lib/src/LoginDialog.tsx') },
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
        ],
        selected: 0,
        formInput: '@#login',
    },
}
