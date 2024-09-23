import type { Meta, StoryObj } from '@storybook/react'

import { VSCodeStandaloneComponent } from '../../storybook/VSCodeStoryDecorator'

import { type Model, ModelTag, ModelUsage, getDotComDefaultModels } from '@sourcegraph/cody-shared'
import { useArgs } from '@storybook/preview-api'
import { ModelSelectField } from './ModelSelectField'

const MODELS: Model[] = [
    ...getDotComDefaultModels(),
    {
        title: 'Llama 3 q4_K f16',
        provider: 'Ollama',
        id: 'ollama/llama-3',
        contextWindow: { input: 100, output: 100 },
        usage: [ModelUsage.Chat],
        tags: [ModelTag.Ollama, ModelTag.Local],
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

export const FreeUser: Story = {
    args: {
        userInfo: {
            isDotComUser: true,
            isCodyProUser: false,
        },
    },
}

export const ProUser: Story = {
    args: {
        userInfo: {
            isDotComUser: true,
            isCodyProUser: true,
        },
    },
}

export const EnterpriseUser: Story = {
    args: {
        userInfo: {
            isDotComUser: false,
            isCodyProUser: false,
        },
        serverSentModelsEnabled: true,
    },
}
