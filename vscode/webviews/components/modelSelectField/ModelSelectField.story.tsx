import type { Meta, StoryObj } from '@storybook/react'

import { VSCodeStandaloneComponent } from '../../storybook/VSCodeStoryDecorator'

import { type Model, ModelUsage, getDotComDefaultModels } from '@sourcegraph/cody-shared'
import { ModelTag } from '@sourcegraph/cody-shared/src/models/tags'
import { useArgs } from '@storybook/preview-api'
import { ModelSelectField } from './ModelSelectField'

const MODELS: Model[] = [
    ...getDotComDefaultModels(),
    {
        title: 'Llama 3 q4_K f16',
        provider: 'Ollama',
        model: 'ollama/llama-3',
        contextWindow: { input: 100, output: 100 },
        usage: [ModelUsage.Chat],
        tags: [ModelTag.Ollama, ModelTag.Dev],
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
                        models: MODELS.map(m => ({ ...m, default: m.model === model.model })),
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
            isOldStyleEnterpriseUser: true,
        },
    },
}

export const ProUser: Story = {
    args: {
        userInfo: {
            isDotComUser: true,
            isCodyProUser: true,
            isOldStyleEnterpriseUser: false,
        },
    },
}

export const EnterpriseUser: Story = {
    args: {
        userInfo: {
            isDotComUser: false,
            isCodyProUser: false,
            isOldStyleEnterpriseUser: true,
        },
    },
}
