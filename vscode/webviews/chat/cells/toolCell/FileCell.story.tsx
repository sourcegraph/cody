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
            type: 'file-view',
            file: {
                uri: URI.file('path/to/example.ts'),
                fileName: 'example.ts',
                content: 'function example() {\n  console.log("Hello, world!");\n  return true;\n}',
            },
        },
        defaultOpen: true,
    },
}

export const LongFile: Story = {
    args: {
        result: {
            type: 'file-view',
            file: {
                uri: URI.file('longExample.ts'),
                fileName: 'longExample.ts',
                content: Array(20).fill('// This is a line of code').join('\n'),
            },
        },
    },
}

export const WithCustomClass: Story = {
    args: {
        result: {
            type: 'file-view',
            file: {
                uri: URI.file('styled.ts'),
                fileName: 'styled.ts',
                content: 'const styles = {\n  color: "blue",\n  fontSize: 14\n}',
            },
        },
        className: 'tw-max-w-md',
    },
}

export const Collapsed: Story = {
    args: {
        result: {
            type: 'file-view',
            file: {
                uri: URI.file('collapsed.ts'),
                fileName: 'collapsed.ts',
                content: 'const hidden = "This content is initially hidden";',
            },
        },
        defaultOpen: false,
    },
}

export const LongFileName: Story = {
    args: {
        result: {
            type: 'file-view',
            file: {
                uri: URI.file(
                    'very/long/path/to/some/deeply/nested/component/with/long/name/example.ts'
                ),
                fileName: 'very/long/path/to/some/deeply/nested/component/with/long/name/example.ts',
                content: 'export const Component = () => <div>Example</div>;',
            },
        },
    },
}
