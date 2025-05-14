import { UIToolStatus } from '@sourcegraph/cody-shared'
import type { ContextItemToolState } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import type { Meta, StoryObj } from '@storybook/react'
import { URI } from 'vscode-uri'
import { VSCodeWebview } from '../../../storybook/VSCodeStoryDecorator'
import { FileCell } from './FileCell'

const meta: Meta<typeof FileCell> = {
    title: 'agentic/FileCell',
    component: FileCell,
    decorators: [VSCodeWebview],
}
export default meta

type Story = StoryObj<typeof FileCell>

export const Default: Story = {
    args: {
        result: {
            uri: URI.parse('foo.bar'),
            type: 'tool-state',
            outputType: 'file-view',
            status: UIToolStatus.Info,
            title: 'File View',
            toolId: 'file',
            toolName: 'get_file',
            content: 'This is the file content',
        } as ContextItemToolState,
        defaultOpen: false,
        onFileLinkClicked: (uri: URI) => {
            console.log('File link clicked:', uri.toString())
        },
    },
}

export const LongFile: Story = {
    args: {
        result: {
            uri: URI.parse('long-file.ts'),
            type: 'tool-state',
            outputType: 'file-view',
            status: UIToolStatus.Info,
            title: 'File View',
            toolId: 'file',
            toolName: 'get_file',
            content: Array(20).fill('// This is a line of code').join('\n'),
        } as ContextItemToolState,
    },
}

export const WithCustomClass: Story = {
    args: {
        result: {
            uri: URI.parse('foo.bar'),
            type: 'tool-state',
            outputType: 'file-view',
            status: UIToolStatus.Info,
            title: 'File View',
            toolId: 'file',
            toolName: 'get_file',
            content: 'const styles = {\n  color: "blue",\n  fontSize: 14\n}',
        } as ContextItemToolState,
        className: 'tw-max-w-md',
    },
}

export const Collapsed: Story = {
    args: {
        result: {
            uri: URI.parse('foo.bar'),
            type: 'tool-state',
            outputType: 'file-view',
            status: UIToolStatus.Done,
            title: 'File View',
            toolId: 'file',
            toolName: 'get_file',
            content: 'const styles = {\n  color: "blue",\n  fontSize: 14\n}',
        } as ContextItemToolState,
        defaultOpen: false,
    },
}

export const LongFileName: Story = {
    args: {
        result: {
            type: 'tool-state',
            outputType: 'file-view',
            status: UIToolStatus.Done,
            title: 'File View',
            toolId: 'file',
            toolName: 'get_file',
            uri: URI.file('very/long/path/to/some/deeply/nested/component/with/long/name/example.ts'),
        } as ContextItemToolState,
    },
}
