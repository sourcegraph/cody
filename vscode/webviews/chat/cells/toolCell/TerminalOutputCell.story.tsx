import { UIToolStatus } from '@sourcegraph/cody-shared'
import type { ContextItemToolState } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import type { Meta, StoryObj } from '@storybook/react'
import { URI } from 'vscode-uri'
import { VSCodeWebview } from '../../../storybook/VSCodeStoryDecorator'
import { TerminalOutputCell } from './TerminalOutputCell'

const meta: Meta<typeof TerminalOutputCell> = {
    title: 'agentic/TerminalOutputCell',
    component: TerminalOutputCell,
    decorators: [VSCodeWebview],
}

export default meta

type Story = StoryObj<typeof TerminalOutputCell>

// Helper function to create a mock ContextItemToolState with terminal output
const createTerminalItem = (title: string, content: string): ContextItemToolState => ({
    type: 'tool-state',
    toolId: `terminal-${title}-${Date.now()}`,
    toolName: 'run_terminal_command',
    status: UIToolStatus.Done,
    outputType: 'terminal-output',
    title,
    content,
    uri: URI.parse(`cody:/tools/shell/terminal-${title}`),
})

export const Default: Story = {
    args: {
        item: createTerminalItem(
            'ls -la',
            `total 32
drwxr-xr-x  10 user  staff   320 Mar 17 12:34 .
drwxr-xr-x   5 user  staff   160 Mar 17 12:30 ..
-rw-r--r--   1 user  staff  1420 Mar 17 12:34 TerminalOutputCell.tsx`
        ),
        defaultOpen: false,
    },
}

export const WithErrors: Story = {
    args: {
        item: createTerminalItem(
            'npm run build',
            `> cody-vscode@1.0.0 build
> vite build
<sterr>Error: Cannot find module
File not found: /src/components/ui/button.tsx
Build failed with 2 errors</sterr>`
        ),
        defaultOpen: true,
    },
}

export const WithWarnings: Story = {
    args: {
        item: createTerminalItem(
            'npm run lint',
            `> cody-vscode@1.0.0 lint
> eslint . --ext ts,tsx
<sterr>Warning: Unexpected any in types
Consider adding explicit type annotation
Lint complete with 2 warnings</sterr>`
        ),
        defaultOpen: true,
    },
}

export const WithSuccess: Story = {
    args: {
        item: createTerminalItem(
            'npm run test',
            `> cody-vscode@1.0.0 test
> vitest run
Running 24 tests...
Test suite completed: 24 passed, 0 failed`
        ),
        defaultOpen: true,
    },
}

export const Loading: Story = {
    args: {
        item: createTerminalItem('Loading...', ''),
        isLoading: true,
        defaultOpen: true,
    },
}

export const LongOutput: Story = {
    args: {
        item: createTerminalItem(
            'Long Output',
            Array.from(
                { length: 30 },
                (_, i) => `Line ${i + 1}: ${JSON.stringify({ key: `value-${i}` })}`
            ).join('\n')
        ),
        defaultOpen: true,
    },
}
