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
        status: { type: 'no_migration_needed' },
    },
}

export const InitialStateWithAvailableMigration: Story = {
    args: {
        status: { type: 'initial_migration' },
    },
}

export const LoadingStateScanning: Story = {
    args: {
        status: {
            type: 'migrating',
            commandsMigrated: 0,
            allCommandsToMigrate: undefined,
        },
    },
}

export const LoadingStateMigrating: Story = {
    args: {
        status: {
            type: 'migrating',
            commandsMigrated: 0,
            allCommandsToMigrate: 10,
        },
    },
}

export const ErroredStateMigrating: Story = {
    args: {
        status: {
            type: 'migration_failed',
            errorMessage: 'some migration error happened',
        },
    },
}

export const SuccessfulStateMigrating: Story = {
    args: {
        status: {
            type: 'migration_success',
        },
    },
}
