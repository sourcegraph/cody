import { Meta, StoryObj } from '@storybook/react'

import { ChatInputContext } from './ChatInputContext'

const meta: Meta<typeof ChatInputContext> = {
    title: 'ui/ChatInputContext',
    component: ChatInputContext,

    decorators: [
        story => (
            <div
                style={{
                    maxWidth: '600px',
                    margin: '2rem auto',
                    padding: '1rem',
                    border: 'solid 1px #ccc',
                }}
            >
                {story()}
            </div>
        ),
    ],
}

export default meta

export const Empty: StoryObj<typeof meta> = {
    args: {
        contextStatus: {},
    },
}

export const CodebaseIndexed: StoryObj<typeof meta> = {
    args: {
        contextStatus: { codebase: 'github.com/sourcegraph/about', mode: 'embeddings', connection: true },
    },
}

export const CodebaseError: StoryObj<typeof meta> = {
    args: {
        contextStatus: { codebase: 'github.com/sourcegraph/about' },
    },
}

export const CodebaseAndFile: StoryObj<typeof meta> = {
    args: {
        contextStatus: {
            codebase: 'github.com/sourcegraph/about',
            filePath: 'path/to/file.go',
            mode: 'embeddings',
        },
    },
}

export const CodebaseAndFileWithSelections: StoryObj<typeof meta> = {
    render: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <ChatInputContext
                contextStatus={{
                    codebase: 'github.com/sourcegraph/about',
                    filePath: 'path/to/file.go',
                    mode: 'embeddings',
                    selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
                }}
            />
            <ChatInputContext
                contextStatus={{
                    codebase: 'github.com/sourcegraph/about',
                    filePath: 'path/to/file.go',
                    mode: 'embeddings',
                    selectionRange: { start: { line: 0, character: 0 }, end: { line: 1, character: 0 } },
                }}
            />
            <ChatInputContext
                contextStatus={{
                    codebase: 'github.com/sourcegraph/about',
                    filePath: 'path/to/file.go',
                    mode: 'embeddings',
                    selectionRange: { start: { line: 0, character: 0 }, end: { line: 3, character: 0 } },
                }}
            />
            <ChatInputContext
                contextStatus={{
                    codebase: 'github.com/sourcegraph/about',
                    filePath: 'path/to/file.go',
                    mode: 'embeddings',
                    selectionRange: { start: { line: 42, character: 333 }, end: { line: 420, character: 999 } },
                }}
            />
        </div>
    ),
}

export const File: StoryObj<typeof meta> = {
    args: {
        contextStatus: {
            filePath: 'path/to/file.go',
        },
    },
}
