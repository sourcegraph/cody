import type { Meta, StoryObj } from '@storybook/react'

import { ContextItemSource } from '@sourcegraph/cody-shared'
import type { ComponentProps } from 'react'
import { URI } from 'vscode-uri'
import { VSCodeStandaloneComponent } from '../../../storybook/VSCodeStoryDecorator'
import { ContextCell, EditContextButtonChat, __ContextCellStorybookContext } from './ContextCell'

const renderWithInitialOpen = (args: ComponentProps<typeof ContextCell>) => {
    return (
        <__ContextCellStorybookContext.Provider value={{ initialOpen: true }}>
            <ContextCell {...args} />
        </__ContextCellStorybookContext.Provider>
    )
}

const meta: Meta<typeof ContextCell> = {
    title: 'cody/ContextCell',
    component: ContextCell,
    decorators: [VSCodeStandaloneComponent],
    args: {
        isForFirstMessage: true,
        editContextNode: EditContextButtonChat,
    },
    render: renderWithInitialOpen,
}

export default meta

type Story = StoryObj<typeof ContextCell>

export const Default: Story = {
    args: {
        contextAlternatives: [
            {
                strategy: 'alt-0',
                items: [
                    {
                        type: 'file',
                        uri: URI.file('/foo/bar.go'),
                    },
                ],
            },
        ],
        contextItems: [
            { type: 'file', uri: URI.file('/foo/bar.go') },
            { type: 'file', uri: URI.file('/foo/qux.go') },
            {
                type: 'file',
                uri: URI.file(
                    '/this/is/a/very/very/very/very/very/very/very/very/very/very/very/very/very/very/very/very/very/very/very/very/very/very/very/very/very/very/very/very/very/very/very/very/very/very/very/very/very/very/very/long/file/path.ts'
                ),
            },
            {
                type: 'file',
                uri: URI.file('/foo/bar.go'),
                repoName: 'my/cool-repo',
                revision: 'my-revision',
                title: 'my/file.java',
                source: ContextItemSource.Unified,
            },
            {
                type: 'file',
                uri: URI.parse('https://example.com/some-page'),
                source: ContextItemSource.User,
            },
            {
                type: 'file',
                uri: URI.file('/internal/file.go'),
                range: { start: { line: 1, character: 2 }, end: { line: 5, character: 0 } },
            },
            {
                type: 'file',
                uri: URI.file('/internal/large.go'),
                isTooLarge: true,
                source: ContextItemSource.User,
            },
            {
                type: 'file',
                uri: URI.file('/internal/ignored.go'),
                isIgnored: true,
                source: ContextItemSource.User,
            },
            {
                type: 'file',
                uri: URI.file('README.md'),
                range: { start: { line: 1, character: 2 }, end: { line: 5, character: 0 } },
            },
            {
                type: 'file',
                uri: URI.file('C:\\windows\\style\\path\\file.go'),
                range: { start: { line: 1, character: 2 }, end: { line: 5, character: 0 } },
            },
            {
                type: 'file',
                uri: URI.file('\\\\remote\\server\\README.md'),
                range: { start: { line: 1, character: 2 }, end: { line: 5, character: 0 } },
            },
            {
                type: 'symbol',
                uri: URI.file('/util/urlParser.php'),
                kind: 'function',
                symbolName: 'parseURL',
                range: { start: { line: 1, character: 2 }, end: { line: 5, character: 0 } },
            },
        ],
    },
}

export const Followup: Story = {
    args: {
        contextItems: [{ type: 'file', uri: URI.file('/foo/bar.go') }],
        isForFirstMessage: false,
    },
}

export const Loading: Story = {
    args: {
        contextItems: undefined,
        isForFirstMessage: false,
    },
}

export const ExcludedContext: Story = {
    args: {
        contextItems: [
            { type: 'file', uri: URI.file('/foo/bar.go') },
            { type: 'file', uri: URI.file('/foo/qux.go') },
            {
                type: 'file',
                uri: URI.file('/internal/large.go'),
                isTooLarge: true,
                source: ContextItemSource.User,
            },
            {
                type: 'file',
                uri: URI.file('/internal/ignored1.go'),
                isIgnored: true,
                source: ContextItemSource.User,
            },
            {
                type: 'file',
                uri: URI.file('/internal/ignored2.go'),
                isIgnored: true,
                source: ContextItemSource.User,
            },
            {
                type: 'file',
                uri: URI.file('/internal/large2.go'),
                isTooLarge: true,
                source: ContextItemSource.User,
            },
        ],
        isForFirstMessage: true,
    },
}

export const NoContextRequested: Story = {
    args: {
        contextItems: undefined,
        resubmitWithRepoContext: () => Promise.resolve(),
        isForFirstMessage: true,
    },
}

export const NoContextFound: Story = {
    args: {
        contextItems: [],
        isForFirstMessage: true,
    },
}
