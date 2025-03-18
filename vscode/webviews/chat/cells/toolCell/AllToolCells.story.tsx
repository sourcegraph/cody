import { type FileDiff, TerminalLineType } from '@sourcegraph/cody-shared'
import type { Meta, StoryObj } from '@storybook/react'
import { URI } from 'vscode-uri'
import { VSCodeWebview } from '../../../storybook/VSCodeStoryDecorator'

import { DiffCell } from './DiffCell'
import { FileCell } from './FileCell'
import { OutputStatusCell } from './OutputStatusCell'
import { SearchResultsCell } from './SearchResultsCell'
import { TerminalOutputCell } from './TerminalOutputCell'

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

const diffStoryMock = {
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
} satisfies FileDiff

export const AllCells: Story = {
    render: () => (
        <div className="tw-flex tw-flex-col tw-gap-4">
            <h2 className="tw-text-lg tw-font-bold">File</h2>
            <FileCell
                result={{
                    uri: URI.file('path/to/example.ts'),
                    fileName: 'example.ts',
                    content: 'function example() {\n  console.log("Hello, world!");\n  return true;\n}',
                }}
                defaultOpen={defaultOpen}
                onFileLinkClicked={() => {}}
            />

            <h2 className="tw-text-lg tw-font-bold">Diff</h2>
            <DiffCell
                result={diffStoryMock}
                defaultOpen={defaultOpen}
                onFileLinkClicked={onFileLinkClickedMock}
            />

            <h2 className="tw-text-lg tw-font-bold">Search Results</h2>
            <SearchResultsCell
                result={{
                    query: 'useState',
                    results: [
                        {
                            uri: URI.file('/path/to/ChatInput.tsx'),
                            fileName: 'ChatInput.tsx',
                            lineNumber: '1-15',
                            preview: "const [message, setMessage] = useState<string>('')",
                            type: 'code',
                        },
                        {
                            uri: URI.file('/path/to/ChatMessage.tsx'),
                            fileName: 'ChatMessage.tsx',
                            lineNumber: '40-43',
                            preview: 'const [isExpanded, setIsExpanded] = useState(false)',
                            type: 'code',
                        },
                    ],
                }}
                onFileLinkClicked={onFileLinkClickedMock}
                defaultOpen={defaultOpen}
            />

            <h2 className="tw-text-lg tw-font-bold">Terminal Output</h2>
            <TerminalOutputCell
                result={[
                    { content: 'ls -la', type: TerminalLineType.Input },
                    { content: 'total 32' },
                    { content: 'drwxr-xr-x  10 user  staff   320 Mar 17 12:34 .' },
                    { content: 'drwxr-xr-x   5 user  staff   160 Mar 17 12:30 ..' },
                ]}
                defaultOpen={defaultOpen}
            />

            <h2 className="tw-text-lg tw-font-bold">Anything else...</h2>
            <OutputStatusCell
                title="Process Output"
                status="info"
                result="This is the default output content"
                defaultOpen={defaultOpen}
            />
        </div>
    ),
}
