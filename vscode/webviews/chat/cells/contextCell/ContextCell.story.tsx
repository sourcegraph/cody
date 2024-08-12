import type { Meta, StoryObj } from '@storybook/react'

import { ContextItemSource } from '@sourcegraph/cody-shared'
import { URI } from 'vscode-uri'
import { VSCodeStandaloneComponent } from '../../../storybook/VSCodeStoryDecorator'
import { ContextCell } from './ContextCell'

const meta: Meta<typeof ContextCell> = {
    title: 'cody/ContextCell',
    component: ContextCell,
    decorators: [VSCodeStandaloneComponent],
    args: {
        __storybook__initialOpen: true,
        isForFirstMessage: true,
    },
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
