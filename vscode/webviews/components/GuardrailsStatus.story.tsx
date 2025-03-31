import { GuardrailsCheckStatus } from '@sourcegraph/cody-shared'
import type { Meta, StoryObj } from '@storybook/react'
import { GuardrailsStatus } from './GuardrailsStatus'

const meta: Meta<typeof GuardrailsStatus> = {
    title: 'Components/GuardrailsStatus',
    component: GuardrailsStatus,
    args: {
        tooltip: 'Guardrails status tooltip',
    },
}

export default meta
type Story = StoryObj<typeof GuardrailsStatus>

export const AllStatuses: Story = {
    render: () => (
        <div style={{ display: 'flex', gap: '1rem' }}>
            <GuardrailsStatus status={GuardrailsCheckStatus.GeneratingCode} />
            <GuardrailsStatus status={GuardrailsCheckStatus.Checking} />
            <GuardrailsStatus status={GuardrailsCheckStatus.Success} />
            <GuardrailsStatus status={GuardrailsCheckStatus.Success} filename="/path/to/file.js" />
            <GuardrailsStatus
                status={GuardrailsCheckStatus.Failed}
                tooltip="Found in X repositories: Y, Z"
            />
            <GuardrailsStatus
                status={GuardrailsCheckStatus.Error}
                onRetry={() => console.log('Retry clicked')}
            />
        </div>
    ),
}
