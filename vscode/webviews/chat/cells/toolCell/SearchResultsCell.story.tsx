import { ContextItemSource, UIToolStatus } from '@sourcegraph/cody-shared'
import type {
    ContextItem,
    ContextItemToolState,
} from '@sourcegraph/cody-shared/src/codebase-context/messages'
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

// Create sample context items for search results
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

// Sample search results
const searchResultMock: ContextItemToolState = {
    toolId: 'search-1',
    toolName: 'search',
    status: UIToolStatus.Done,
    type: 'tool-state',
    outputType: 'search-result',
    title: 'useState',
    uri: URI.parse('cody:/tools/search/useState'),
    content: 'Search for "useState" (7 results)',
    description: 'Search for "useState" (7 results)',
    source: ContextItemSource.Agentic,
    searchResultItems: searchContextItems,
}

const searchResultMockFew: ContextItemToolState = {
    toolId: 'search-few',
    toolName: 'search',
    status: UIToolStatus.Done,
    type: 'tool-state',
    outputType: 'search-result',
    title: 'useEffect',
    uri: URI.parse('cody:/tools/search/useEffect'),
    content: 'Search for "useEffect" (2 results)',
    description: 'Search for "useEffect" (2 results)',
    source: ContextItemSource.Agentic,
    searchResultItems: searchContextItems.slice(0, 2),
}

const searchResultMockMany: ContextItemToolState = {
    toolId: 'search-many',
    toolName: 'search',
    status: UIToolStatus.Done,
    type: 'tool-state',
    outputType: 'search-result',
    title: 'component',
    uri: URI.parse('cody:/tools/search/component'),
    content: 'Search for "component" (14 results)',
    description: 'Search for "component" (14 results)',
    source: ContextItemSource.Agentic,
    searchResultItems: [
        ...searchContextItems,
        ...searchContextItems.map(item => ({
            ...item,
        })),
    ],
}

export const Default: Story = {
    args: { results: searchResultMock.searchResultItems, isLoading: false },
}

export const Expanded: Story = {
    args: {
        query: searchResultMock.title,
        results: searchResultMock.searchResultItems,
        isLoading: false,
        defaultOpen: true,
    },
}

export const Loading: Story = {
    args: {
        query: searchResultMock.title,
        results: searchResultMock.searchResultItems,
        isLoading: true,
    },
}

export const FewResults: Story = {
    args: {
        query: 'useEffect',
        results: searchResultMockFew.searchResultItems,
        isLoading: false,
    },
}

export const ManyResults: Story = {
    args: {
        query: 'component',
        results: searchResultMockMany.searchResultItems,
        isLoading: false,
    },
}
