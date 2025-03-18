import type { UIFileDiff } from '@sourcegraph/cody-shared'
import type { Meta, StoryObj } from '@storybook/react'
import { URI } from 'vscode-uri'
import { VSCodeWebview } from '../../../storybook/VSCodeStoryDecorator'
import { DiffCell } from './DiffCell'

const diffStoryMock = {
    fileName: 'ToolsStatus.tsx',
    uri: URI.file('path/to/ToolsStatus.tsx'),
    total: {
        added: 6,
        removed: 69,
        modified: 98,
    },
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
} satisfies UIFileDiff

const meta: Meta<typeof DiffCell> = {
    title: 'agentic/DiffCell',
    component: DiffCell,
    decorators: [VSCodeWebview],
}

export default meta

type Story = StoryObj<typeof DiffCell>

export const Default: Story = {
    args: {
        result: { ...diffStoryMock },
        defaultOpen: true,
    },
}

export const CollapsedByDefault: Story = {
    args: {
        result: { ...diffStoryMock },
        defaultOpen: false,
    },
}

export const CustomClassName: Story = {
    args: {
        result: { ...diffStoryMock },
        className: 'tw-my-4 tw-shadow-md',
        defaultOpen: true,
    },
}

export const LargeDiff: Story = {
    args: {
        defaultOpen: true,
        result: {
            uri: URI.file('path/to/LargeComponent.tsx'),
            fileName: 'LargeComponent.tsx',
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
        } satisfies UIFileDiff,
    },
}
