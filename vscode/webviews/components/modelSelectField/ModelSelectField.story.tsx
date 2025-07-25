import type { Meta, StoryObj } from '@storybook/react'

import { VSCodeStandaloneComponent } from '../../storybook/VSCodeStoryDecorator'

import { FIXTURE_MODELS, type Model, ModelTag, ModelUsage } from '@sourcegraph/cody-shared'
import { DeepCodyAgentID } from '@sourcegraph/cody-shared/src/models/client'
import { useArgs } from '@storybook/preview-api'
import { ModelSelectField } from './ModelSelectField'

const MODELS: Model[] = [
    ...FIXTURE_MODELS,
    {
        title: 'Llama 3 q4_K f16',
        provider: 'Ollama',
        id: 'ollama/llama-3',
        contextWindow: { input: 100, output: 100 },
        usage: [ModelUsage.Chat],
        tags: [ModelTag.Ollama, ModelTag.Local],
    },
    {
        title: 'Deep Cody',
        provider: 'sourcegraph',
        id: DeepCodyAgentID,
        contextWindow: { input: 100, output: 100 },
        usage: [ModelUsage.Chat],
        tags: [ModelTag.Pro, ModelTag.Experimental],
    },
    {
        title: 'Claude 3.7 Sonnet',
        provider: 'anthropic',
        id: 'anthropic/claude-3-7-sonnet',
        contextWindow: { input: 175000, output: 8000 },
        usage: [ModelUsage.Chat],
        tags: [ModelTag.Power],
    },
]

const meta: Meta<typeof ModelSelectField> = {
    title: 'cody/ModelSelectField',
    component: ModelSelectField,
    decorators: [
        story => <div style={{ width: '400px', maxHeight: 'max(300px, 80vh)' }}> {story()} </div>,
        VSCodeStandaloneComponent,
    ],
    args: {
        models: MODELS,
        __storybook__open: true,
    },
    render: args => {
        const [, updateArgs] = useArgs()
        return (
            <ModelSelectField
                {...args}
                onModelSelect={model => {
                    updateArgs({
                        models: MODELS.map(m => ({ ...m, default: m.id === model.id })),
                    })
                }}
            />
        )
    },
}

export default meta

type Story = StoryObj<typeof ModelSelectField>

export const EnterpriseUser: Story = {
    args: {
        serverSentModelsEnabled: true,
    },
}

// The model selector's value is always Claude 3.7 Sonnet in agentic mode
export const AgenticMode: Story = {
    args: {
        intent: 'agentic',
    },
}
