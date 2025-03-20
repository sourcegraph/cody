import { type UIFileDiff, UIToolStatus } from '@sourcegraph/cody-shared'
import { URI } from 'vscode-uri'
import { VSCodeWebview } from '../../../storybook/VSCodeStoryDecorator'

import type {
    ContextItem,
    ContextItemToolState,
} from '@sourcegraph/cody-shared/src/codebase-context/messages'
import type { Meta, StoryObj } from '@storybook/react'
import { DiffCell } from './DiffCell'
import { FileCell } from './FileCell'
import { OutputStatusCell } from './OutputStatusCell'
import { SearchResultsCell } from './SearchResultsCell'
import { ToolStatusCell } from './ToolStatusCell'

const meta: Meta<any> = {
    title: 'agentic/AllToolCells',
    decorators: [VSCodeWebview],
}
export default meta

type Story = StoryObj

const onFileLinkClickedMock = (uri: URI) => {
    console.log(`File link clicked: ${uri.toString()}`)
}

const defaultOpen = true

// Create an extended interface similar to DiffContextItemToolState from DiffCell.story.tsx
interface ExtendedUIFileDiff extends UIFileDiff {
    toolId: string
    toolName: string
    outputType: string
    status: UIToolStatus
}

const searchContextItems: ContextItem[] = [
    {
        type: 'file',
        uri: URI.file('/path/to/ChatInput.tsx'),
        range: {
            start: { line: 0, character: 0 },
            end: { line: 5, character: 0 },
        },
        content: "const [message, setMessage] = useState<string>('')",
    },
    {
        type: 'file',
        uri: URI.file('/path/to/ChatMessage.tsx'),
        range: {
            start: { line: 39, character: 0 },
            end: { line: 42, character: 0 },
        },
        content: 'const [isExpanded, setIsExpanded] = useState(false)',
    },
    {
        type: 'file',
        uri: URI.file('/path/to/use-chat.ts'),
        range: {
            start: { line: 0, character: 0 },
            end: { line: 122, character: 0 },
        },
        content: 'const [messages, setMessages] = useState<Message[]>([])',
    },
    {
        type: 'file',
        uri: URI.file('/path/to/collapsible.tsx'),
        range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
        },
    },
    {
        type: 'file',
        uri: URI.file('/path/to/chat'),
        range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
        },
    },
    {
        type: 'file',
        uri: URI.file('/path/to/page.tsx'),
        range: {
            start: { line: 0, character: 0 },
            end: { line: 14, character: 0 },
        },
        content: 'const [isLoading, setIsLoading] = useState(false)',
    },
    {
        type: 'file',
        uri: URI.file('/path/to/page.tsx'),
        range: {
            start: { line: 14, character: 0 },
            end: { line: 14, character: 0 },
        },
        content: 'const [settings, setSettings] = useState<Settings>(defaultSettings)',
    },
]

const mockTerminalContextItem = {
    toolId: 'terminal-all-cells',
    toolName: 'terminal',
    outputType: 'terminal-output',
    status: UIToolStatus.Done,
    title: 'ls -la',
    content:
        'ls -la\ntotal 32\ndrwxr-xr-x  10 user  staff   320 Mar 17 12:34 .\ndrwxr-xr-x   5 user  staff   160 Mar 17 12:30 ..',
    uri: URI.file('dummy-path-for-terminal.txt'),
}

const diffStoryMock: ExtendedUIFileDiff = {
    toolId: 'diff-all-cells',
    toolName: 'diff',
    outputType: 'file-diff',
    uri: URI.file('path/to/LargeComponent.tsx'),
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
    status: UIToolStatus.Done,
}

export const AllCells: Story = {
    render: () => (
        <div className="tw-flex tw-flex-col tw-gap-4">
            <h2 className="tw-text-lg tw-font-bold">File</h2>
            <FileCell
                result={{
                    type: 'tool-state',
                    toolId: 'file-all-cells',
                    toolName: 'file',
                    outputType: 'file-view',
                    uri: URI.file('path/to/example.ts'),
                    title: 'path/to/example.ts',
                    content: 'function example() {\n  console.log("Hello, world!");\n  return true;\n}',
                    status: UIToolStatus.Done,
                }}
                defaultOpen={defaultOpen}
                onFileLinkClicked={() => {}}
            />

            <h2 className="tw-text-lg tw-font-bold">Diff</h2>
            <DiffCell
                // Using type assertion to add the required diff-specific fields
                item={{
                    type: 'tool-state',
                    toolId: diffStoryMock.toolId,
                    toolName: diffStoryMock.toolName,
                    outputType: 'file-diff' as const,
                    uri: diffStoryMock.uri,
                    status: diffStoryMock.status,
                }}
                defaultOpen={defaultOpen}
                onFileLinkClicked={onFileLinkClickedMock}
            />

            <h2 className="tw-text-lg tw-font-bold">Search Results</h2>
            <SearchResultsCell
                query="useState"
                results={searchContextItems}
                onFileLinkClicked={onFileLinkClickedMock}
                defaultOpen={defaultOpen}
            />

            <h2 className="tw-text-lg tw-font-bold">Terminal Output</h2>
            <ToolStatusCell
                title={'Terminal'}
                output={mockTerminalContextItem as ContextItemToolState}
            />

            <h2 className="tw-text-lg tw-font-bold">Anything else...</h2>
            <OutputStatusCell
                item={{
                    type: 'tool-state',
                    toolId: 'status-all-cells',
                    toolName: 'status',
                    outputType: 'status' as const,
                    title: 'Process Output',
                    status: UIToolStatus.Done,
                    content: 'This is the default output content',
                    uri: URI.file('dummy-path-for-status.txt'),
                }}
                defaultOpen={defaultOpen}
            />
        </div>
    ),
}
