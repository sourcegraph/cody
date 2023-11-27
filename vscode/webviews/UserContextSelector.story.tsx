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
        contextSelection: [{ fileName: 'open-file.py' }, { fileName: 'open-file.go' }, { fileName: 'open-file-2.go' }, { fileName: 'open-file-3.go' }, { fileName: 'open-file-4.go' }, { fileName: 'open-file-5.go' }, { fileName: 'open-file-6.go' }, { fileName: 'open-file-7.go' }, { fileName: 'open-file-8.go' }],
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
            { fileName: 'handleLogin', type: 'symbol', kind: 'method', path: { relative: 'lib/src/LoginDialog.tsx' } },
        ],
        selected: 0,
        formInput: '@#login',
    },
}
