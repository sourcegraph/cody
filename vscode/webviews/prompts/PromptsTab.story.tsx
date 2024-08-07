import { ExtensionAPIProviderForTestsOnly, MOCK_API } from '@sourcegraph/prompt-editor'
import type { Meta, StoryObj } from '@storybook/react'
import { FIXTURE_COMMANDS, makePromptsAPIWithData } from '../components/promptList/fixtures'
import { FIXTURE_PROMPTS } from '../components/promptSelectField/fixtures'
import { VSCodeStandaloneComponent } from '../storybook/VSCodeStoryDecorator'
import { PromptsTab } from './PromptsTab'

const meta: Meta<typeof PromptsTab> = {
    title: 'cody/PromptsTab',
    component: PromptsTab,
    decorators: [VSCodeStandaloneComponent],
    render: args => (
        <div style={{ position: 'relative', padding: '1rem' }}>
            <PromptsTab {...args} />
        </div>
    ),
}

export default meta

type Story = StoryObj<typeof PromptsTab>

export const WithPromptsAndCommands: Story = {
    render: args => (
        <ExtensionAPIProviderForTestsOnly
            value={{
                ...MOCK_API,
                prompts: makePromptsAPIWithData({
                    prompts: { type: 'results', results: FIXTURE_PROMPTS },
                    commands: FIXTURE_COMMANDS,
                }),
            }}
        >
            <PromptsTab {...args} />
        </ExtensionAPIProviderForTestsOnly>
    ),
}

export const WithOnlyCommands: Story = {
    render: args => (
        <ExtensionAPIProviderForTestsOnly
            value={{
                ...MOCK_API,
                prompts: makePromptsAPIWithData({
                    prompts: { type: 'unsupported' },
                    commands: FIXTURE_COMMANDS,
                }),
            }}
        >
            <PromptsTab {...args} />
        </ExtensionAPIProviderForTestsOnly>
    ),
}
