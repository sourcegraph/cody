import type { SearchResultView } from '@sourcegraph/cody-shared'
import type { Meta, StoryObj } from '@storybook/react'
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
            fileName: 'ChatInput.tsx',
            lineNumber: '15',
            preview: "const [message, setMessage] = useState<string>('')",
            type: 'code',
        },
        {
            fileName: 'ChatMessage.tsx',
            lineNumber: '15',
            preview: 'const [isExpanded, setIsExpanded] = useState(false)',
            type: 'code',
        },
        {
            fileName: 'use-chat.ts',
            lineNumber: '15',
            preview: 'const [messages, setMessages] = useState<Message[]>([])',
            type: 'code',
        },
        {
            fileName: 'collapsible.tsx',
            type: 'file',
        },
        {
            fileName: 'chat',
            type: 'folder',
        },
        {
            fileName: 'page.tsx',
            lineNumber: '15',
            preview: 'const [isLoading, setIsLoading] = useState(false)',
            type: 'code',
        },
        {
            fileName: 'page.tsx',
            lineNumber: '15',
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
