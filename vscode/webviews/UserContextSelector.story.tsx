import { Meta, StoryObj } from '@storybook/react'

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
            fileName: `file-${i}.py`,
            path: { relative: `${i ? 'sub-dir/'.repeat(i * 5) + '/' : ''}file-${i}.py` },
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
            { fileName: 'LoginDialog', type: 'symbol', kind: 'class', path: { relative: 'lib/src/LoginDialog.tsx' } },
            {
                fileName: 'login',
                type: 'symbol',
                kind: 'function',
                path: { relative: 'src/login.go' },
                range: { start: { line: 42, character: 1 }, end: { line: 44, character: 1 } },
            },
            {
                fileName: 'handleLogin',
                type: 'symbol',
                kind: 'method',
                path: { relative: `${'sub-dir/'.repeat(50)}/}/src/LoginDialog.tsx` },
            },
            {
                fileName: 'handleLogin',
                type: 'symbol',
                kind: 'method',
                path: { relative: `${'sub-dir/'.repeat(50)}/}/src/LoginDialog.tsx` },
            },
            {
                fileName: 'handleLogin',
                type: 'symbol',
                kind: 'method',
                path: { relative: `${'sub-dir/'.repeat(50)}/}/src/LoginDialog.tsx` },
            },
            {
                fileName: 'handleLogin',
                type: 'symbol',
                kind: 'method',
                path: { relative: `${'sub-dir/'.repeat(50)}/}/src/LoginDialog.tsx` },
            },
            {
                fileName: 'handleLogin',
                type: 'symbol',
                kind: 'method',
                path: { relative: `${'sub-dir/'.repeat(50)}/}/src/LoginDialog.tsx` },
            },
        ],
        selected: 0,
        formInput: '@#login',
    },
}
