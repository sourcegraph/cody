import type { Meta, StoryObj } from '@storybook/react'
import { VSCodeStandaloneComponent } from '../../../storybook/VSCodeStoryDecorator'
import ApprovalCell from './ApprovalCell'

const meta: Meta<typeof ApprovalCell> = {
    title: 'cody/ApprovalCell',
    component: ApprovalCell,
    decorators: [VSCodeStandaloneComponent],
}

export default meta

type Story = StoryObj<typeof ApprovalCell>

export const Default: Story = {
    args: {
        vscodeAPI: {
            postMessage: () => {},
            getState: () => ({}),
            setState: () => {},
            onMessage: (callback: (message: any) => void) => {
                // Simulate confirmation requests for different scenarios
                callback({
                    type: 'action/confirmationRequest',
                    id: 'action1',
                    step: {
                        id: 'action1',
                        type: 'confirmation',
                        title: 'Confirm Action',
                        content: 'Would you like to proceed with this action?',
                    },
                })
                return () => {}
            },
        },
    },
}

export const WithoutTitle: Story = {
    args: {
        vscodeAPI: {
            postMessage: () => {},
            getState: () => ({}),
            setState: () => {},
            onMessage: (callback: (message: any) => void) => {
                // Simulate confirmation requests for different scenarios
                callback({
                    type: 'action/confirmationRequest',
                    id: 'action1',
                    step: {
                        id: '',
                        type: 'confirmation',
                        content: 'Commit all staged changes',
                    },
                })
                return () => {}
            },
        },
    },
}

export const MultipleActions: Story = {
    args: {
        vscodeAPI: {
            getState: () => ({}),
            postMessage: () => {},
            setState: () => {},
            onMessage: (callback: (message: any) => void) => {
                callback({
                    type: 'action/confirmationRequest',
                    id: 'action1',
                    step: {
                        id: 'action1',
                        type: 'confirmation',
                        title: 'Delete File',
                        content: 'Are you sure you want to delete this file?',
                    },
                })
                callback({
                    type: 'action/confirmationRequest',
                    id: 'action2',
                    step: {
                        id: 'action2',
                        type: 'confirmation',
                        title: 'Update Dependencies',
                        content: 'Do you want to update all project dependencies?',
                    },
                })
                return () => {}
            },
        },
    },
}

export const Empty: Story = {
    args: {
        vscodeAPI: {
            getState: () => ({}),
            postMessage: () => {},
            setState: () => {},
            onMessage: () => () => {},
        },
    },
}
