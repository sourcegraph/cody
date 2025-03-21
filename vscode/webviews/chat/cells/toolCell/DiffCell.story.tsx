import { UIToolStatus } from '@sourcegraph/cody-shared'
import type { ContextItemToolState } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import type { Meta, StoryObj } from '@storybook/react'
import { URI } from 'vscode-uri'
import { VSCodeWebview } from '../../../storybook/VSCodeStoryDecorator'
import { DiffCell } from './DiffCell'

// Extended version of ContextItemToolState with diff-specific fields for storybook
interface DiffContextItemToolState extends ContextItemToolState {
    // Custom fields for DiffCell stories
    changes: Array<{
        type: 'unchanged' | 'added' | 'removed'
        content: string
        lineNumber: number
    }>
    total?: {
        added: number
        removed: number
        modified: number
    }
    uri: URI
}

const diffStoryMock: DiffContextItemToolState = {
    type: 'tool-state',
    toolId: 'diff-mock-1',
    toolName: 'diff',
    outputType: 'file-diff',
    uri: URI.file('path/to/ToolsStatus.tsx'),
    status: UIToolStatus.Pending,
    changes: [
        { type: 'unchanged', content: '@@ -127,9 +127,9 @@', lineNumber: 127 },
        {
            type: 'unchanged',
            content: '    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`',
            lineNumber: 128,
        },
        {
            type: 'unchanged',
            content: '    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`',
            lineNumber: 129,
        },
        { type: 'unchanged', content: '}', lineNumber: 130 },
        { type: 'unchanged', content: '', lineNumber: 131 },
        { type: 'removed', content: 'export default function JobMonitor() {', lineNumber: 132 },
        {
            type: 'added',
            content: 'export default function ToolsStatus({ tools }: ToolsStatusProps) {',
            lineNumber: 132,
        },
        {
            type: 'unchanged',
            content: '  const [expanded, setExpanded] = useState(false)',
            lineNumber: 133,
        },
        {
            type: 'unchanged',
            content: '  const [selectedJob, setSelectedJob] = useState<string | null>',
            lineNumber: 134,
        },
        {
            type: 'unchanged',
            content: "  const [activeTab, setActiveTab] = useState<string>('logs')",
            lineNumber: 135,
        },
        {
            type: 'unchanged',
            content: '  const [jobs, setJobs] = useState<Job[]>(mockJobs)',
            lineNumber: 136,
        },
    ],
    total: {
        added: 6,
        removed: 69,
        modified: 98,
    },
}

const meta: Meta<typeof DiffCell> = {
    title: 'agentic/DiffCell',
    component: DiffCell,
    decorators: [VSCodeWebview],
}

export default meta

type Story = StoryObj<typeof DiffCell>

export const Default: Story = {
    args: {
        item: {
            ...diffStoryMock,
            status: UIToolStatus.Done,
        },
        defaultOpen: true,
        onFileLinkClicked: uri => console.log('File link clicked:', uri.toString()),
    },
}

export const CollapsedByDefault: Story = {
    args: {
        item: {
            ...diffStoryMock,
            status: UIToolStatus.Done,
        },
        defaultOpen: false,
        onFileLinkClicked: uri => console.log('File link clicked:', uri.toString()),
    },
}

export const CustomClassName: Story = {
    args: {
        item: {
            ...diffStoryMock,
            status: UIToolStatus.Done,
        },
        className: 'tw-my-4 tw-shadow-md',
        defaultOpen: true,
        onFileLinkClicked: uri => console.log('File link clicked:', uri.toString()),
    },
}

export const LargeDiff: Story = {
    args: {
        item: {
            type: 'tool-state',
            toolId: 'large-diff-mock',
            toolName: 'diff',
            outputType: 'file-diff',
            uri: URI.file('path/to/LargeComponent.tsx'),
            status: UIToolStatus.Done,
            total: {
                added: 42,
                removed: 15,
                modified: 108,
            },
            changes: [
                { type: 'unchanged', content: '@@ -127,9 +127,9 @@', lineNumber: 127 },
                ...Array(30)
                    .fill(0)
                    .map((_, i) => {
                        const type: 'unchanged' | 'added' | 'removed' =
                            i % 3 === 0 ? 'unchanged' : i % 3 === 1 ? 'added' : 'removed'
                        return {
                            type,
                            content: `const line${i} = ${
                                i % 3 === 1 ? '"new implementation"' : '"old implementation"'
                            }`,
                            lineNumber: 128 + i,
                        }
                    }),
            ],
        } as DiffContextItemToolState,
        defaultOpen: true,
        onFileLinkClicked: uri => console.log('File link clicked:', uri.toString()),
    },
}
