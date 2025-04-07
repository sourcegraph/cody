import { UIToolStatus } from '@sourcegraph/cody-shared'
import type { ContextItemToolState } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import type { Meta, StoryObj } from '@storybook/react'
import { URI } from 'vscode-uri'
import { VSCodeWebview } from '../../../storybook/VSCodeStoryDecorator'
import { DiffCell } from './DiffCell'

const diffStoryMock: ContextItemToolState = {
    type: 'tool-state',
    toolId: 'diff-mock-1',
    toolName: 'diff',
    outputType: 'file-diff',
    uri: URI.file('path/to/ToolsStatus.tsx'),
    status: UIToolStatus.Pending,
    metadata: [
        `async function deleteEditHistoryItem(
      uri: vscode.Uri,
      content: string,
      timestamp?: string
  ): Promise<string> {
      // Remove the history item after reverting
      historyStore.delete(uri.toString())
      // Update the source control panel display
      updateEditHistoryGroup()
      const contentBuffer = new TextEncoder().encode(content)
      await vscode.workspace.fs.writeFile(uri, contentBuffer)
      const msg = 'Edit history item deleted'
      vscode.window.showInformationMessage(msg)
      return msg
  }`,
        `async function deleteEditHistoryItem(
      uri: vscode.Uri,
      content: string,
      timestamp?: string
  ): Promise<string> {
      // Remove the history item after reverting
      historyStore.delete(uri.toString())

      // Update the source control panel display
      updateEditHistoryGroup()

      const contentBuffer = new TextEncoder().encode(content)
      await vscode.workspace.fs.writeFile(uri, contentBuffer)
      return 'Reverted changes to ' + displayPath(uri)
  }
  `,
    ],
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

export const ErrorState: Story = {
    args: {
        item: {
            ...diffStoryMock,
            status: UIToolStatus.Error,
        },
        defaultOpen: true,
        onFileLinkClicked: uri => console.log('File link clicked:', uri.toString()),
    },
}

export const LargeDiff: Story = {
    args: {
        item: {
            ...diffStoryMock,
            type: 'tool-state',
            toolId: 'large-diff-mock',
            toolName: 'diff',
            outputType: 'file-diff',
            uri: URI.file('path/to/LargeComponent.tsx'),
            status: UIToolStatus.Done,
            metadata: [
                // Multiple the content to simulate a large diff
                diffStoryMock.metadata![0].repeat(20),
                diffStoryMock.metadata![1].repeat(20),
            ],
        } as ContextItemToolState,
        defaultOpen: true,
        onFileLinkClicked: uri => console.log('File link clicked:', uri.toString()),
    },
}
