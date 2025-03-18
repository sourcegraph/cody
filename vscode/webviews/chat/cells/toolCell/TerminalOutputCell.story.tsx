import { UITerminalLineType } from '@sourcegraph/cody-shared'
import type { Meta, StoryObj } from '@storybook/react'
import { VSCodeWebview } from '../../../storybook/VSCodeStoryDecorator'
import { TerminalOutputCell } from './TerminalOutputCell'

const meta: Meta<typeof TerminalOutputCell> = {
    title: 'agentic/TerminalOutputCell',
    component: TerminalOutputCell,
    decorators: [VSCodeWebview],
}

export default meta

type Story = StoryObj<typeof TerminalOutputCell>

export const Default: Story = {
    args: {
        result: [
            { content: 'ls -la', type: UITerminalLineType.Input },
            { content: 'total 32' },
            { content: 'drwxr-xr-x  10 user  staff   320 Mar 17 12:34 .' },
            { content: 'drwxr-xr-x   5 user  staff   160 Mar 17 12:30 ..' },
            { content: '-rw-r--r--   1 user  staff  1420 Mar 17 12:34 TerminalOutputCell.tsx' },
        ],
    },
}

export const WithErrors: Story = {
    args: {
        result: [
            { content: 'npm run build', type: UITerminalLineType.Input },
            { content: '> cody-vscode@1.0.0 build' },
            { content: '> vite build' },
            { content: 'Error: Cannot find module', type: UITerminalLineType.Error },
            { content: 'File not found: /src/components/ui/button.tsx', type: UITerminalLineType.Error },
            { content: 'Build failed with 2 errors', type: UITerminalLineType.Error },
        ],
        defaultOpen: true,
    },
}

export const WithWarnings: Story = {
    args: {
        result: [
            { content: 'npm run lint', type: UITerminalLineType.Input },
            { content: '> cody-vscode@1.0.0 lint' },
            { content: '> eslint . --ext ts,tsx' },
            { content: 'Warning: Unexpected any in types', type: UITerminalLineType.Warning },
            { content: 'Consider adding explicit type annotation', type: UITerminalLineType.Warning },
            { content: 'Lint complete with 2 warnings', type: UITerminalLineType.Warning },
        ],
        defaultOpen: true,
    },
}

export const WithSuccess: Story = {
    args: {
        result: [
            { content: 'npm run test', type: UITerminalLineType.Input },
            { content: '> cody-vscode@1.0.0 test' },
            { content: '> vitest run' },
            { content: 'Running 24 tests...' },
            { content: 'Test suite completed: 24 passed, 0 failed', type: UITerminalLineType.Success },
        ],
        defaultOpen: true,
    },
}

export const Loading: Story = {
    args: {
        result: [],
        isLoading: true,
        defaultOpen: true,
    },
}

export const LongOutput: Story = {
    args: {
        result: Array.from({ length: 30 }, (_, i) => ({
            content: `Line ${i + 1}: ${JSON.stringify({ key: `value-${i}` })}`,
        })),
        defaultOpen: true,
    },
}
