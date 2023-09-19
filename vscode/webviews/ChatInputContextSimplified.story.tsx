import { Meta, StoryObj } from '@storybook/react'

import { ChatContextStatus } from '@sourcegraph/cody-shared'

import { ChatInputContextSimplified } from './ChatInputContextSimplified'
import { VSCodeStoryDecorator } from './storybook/VSCodeStoryDecorator'

const meta: Meta<typeof ChatInputContextSimplified> = {
    title: 'cody/App-less Onboarding',
    component: ChatInputContextSimplified,
    decorators: [VSCodeStoryDecorator],
}

export default meta

const backdropStyle = {
    background: 'var(--vscode-sideBar-background)',
    height: '60vh',
    display: 'flex',
    alignItems: 'end',
}

export const ChatInputContextAppNotInstalled: StoryObj<typeof ChatInputContextSimplified> = {
    render: () => {
        const contextStatus: ChatContextStatus = {
            connection: false,
            codebase: 'github.com/sourcegraph/example',
        }
        return (
            <div style={backdropStyle}>
                <ChatInputContextSimplified isAppInstalled={false} contextStatus={contextStatus} />
            </div>
        )
    },
}

export const ChatInputContextAppInstalled: StoryObj<typeof ChatInputContextSimplified> = {
    render: () => {
        const contextStatus: ChatContextStatus = {
            codebase: 'github.com/sourcegraph/example',
            filePath: 'foo/bar.js',
        }
        return (
            <div style={backdropStyle}>
                <ChatInputContextSimplified isAppInstalled={true} contextStatus={contextStatus} />
            </div>
        )
    },
}
