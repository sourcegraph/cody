import type { SearchResultView } from '@sourcegraph/cody-shared'
import type { Meta, StoryObj } from '@storybook/react'
import { URI } from 'vscode-uri'
import { VSCodeWebview } from '../../../storybook/VSCodeStoryDecorator'
import { SearchResultsCell } from './SearchResultsCell'

const meta: Meta<typeof SearchResultsCell> = {
    title: 'agentic/SearchResultsCell',
    component: SearchResultsCell,
    decorators: [VSCodeWebview],
}

export default meta

type Story = StoryObj<typeof SearchResultsCell>

// Sample search results
const searchResultMock = {
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
            lineNumber: '40-4343',
            preview: 'const [isExpanded, setIsExpanded] = useState(false)',
            type: 'code',
        },
        {
            uri: URI.file('/path/to/use-chat.ts'),
            fileName: 'use-chat.ts',
            lineNumber: '0-12315',
            preview: 'const [messages, setMessages] = useState<Message[]>([])',
            type: 'code',
        },
        {
            uri: URI.file('/path/to/collapsible.tsx'),
            fileName: 'collapsible.tsx',
            type: 'file',
        },
        {
            uri: URI.file('/path/to/chat'),
            fileName: 'chat',
            type: 'folder',
        },
        {
            uri: URI.file('/path/to/page.tsx'),
            fileName: 'page.tsx',
            lineNumber: '1-15',
            preview: 'const [isLoading, setIsLoading] = useState(false)',
            type: 'code',
        },
        {
            uri: URI.file('/path/to/page.tsx'),
            fileName: 'page.tsx',
            lineNumber: '15-15',
            preview: 'const [settings, setSettings] = useState<Settings>(defaultSettings)',
            type: 'code',
        },
    ],
} satisfies SearchResultView
export const Default: Story = {
    args: {
        result: searchResultMock,
        isLoading: false,
    },
}
export const Expanded: Story = {
    args: {
        result: searchResultMock,
        isLoading: false,
        defaultOpen: true,
    },
}

export const Loading: Story = {
    args: {
        result: searchResultMock,
        isLoading: true,
    },
}

export const FewResults: Story = {
    args: {
        result: {
            query: 'useEffect',
            results: searchResultMock.results.slice(0, 2),
        },
        isLoading: false,
    },
}

export const ManyResults: Story = {
    args: {
        result: {
            query: 'component',
            results: [
                ...searchResultMock.results,
                ...searchResultMock.results.map((result, index) => ({
                    ...result,
                    fileName: `${result.fileName}-${index}`,
                })),
            ],
        },
        isLoading: false,
    },
}
