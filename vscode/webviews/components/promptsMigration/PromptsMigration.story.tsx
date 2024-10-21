import type { Meta } from '@storybook/react'

import { VSCodeStandaloneComponent, VSCodeWebview } from '../../storybook/VSCodeStoryDecorator'

import type { StoryObj } from '@storybook/react'
import { PromptsMigration } from './PromptsMigration'

const meta: Meta<typeof PromptsMigration> = {
    title: 'cody/PromptsMigration',
    component: PromptsMigration,
    decorators: [VSCodeWebview, VSCodeStandaloneComponent],
}

export default meta

type Story = StoryObj<typeof PromptsMigration>

export const DefaultInitialState: Story = {
    args: {
        status: 'initial',
        isMigrationAvailable: false,
    },
}

export const InitialStateWithAvailableMigration: Story = {
    args: {
        status: 'initial',
        isMigrationAvailable: true,
    },
}

export const LoadingStateScanning: Story = {
    args: {
        status: 'loading',
        migratedPrompts: 0,
        promptsToMigrate: undefined,
    },
}

export const LoadingStateMigrating: Story = {
    args: {
        status: 'loading',
        migratedPrompts: 1,
        promptsToMigrate: 10,
    },
}

export const ErroredStateMigrating: Story = {
    args: {
        status: 'error',
        errorMessage: 'some migration error happened',
    },
}

export const SuccessfulStateMigrating: Story = {
    args: {
        status: 'finished',
    },
}
