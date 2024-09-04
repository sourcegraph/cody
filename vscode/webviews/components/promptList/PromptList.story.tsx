import { ExtensionAPIProviderForTestsOnly, MOCK_API } from '@sourcegraph/prompt-editor'
import type { Meta, StoryObj } from '@storybook/react'
import { VSCodeStandaloneComponent } from '../../storybook/VSCodeStoryDecorator'
import { FIXTURE_PROMPTS } from '../promptSelectField/fixtures'
import { PromptList } from './PromptList'
import { FIXTURE_COMMANDS } from './fixtures'
import { makePromptsAPIWithData } from './fixtures'

const meta: Meta<typeof PromptList> = {
    title: 'cody/PromptList',
    component: PromptList,
    decorators: [
        story => (
            <div className="tw-border tw-border-border" style={{ maxWidth: '700px', margin: '2rem' }}>
                {story()}
            </div>
        ),
        VSCodeStandaloneComponent,
    ],
    args: {
        onSelect: item => {
            console.log('onSelect', item)
        },
        className: '!tw-max-w-[unset]',
    },
}

export default meta

type Story = StoryObj<typeof PromptList>

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
            <PromptList {...args} />
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
            <PromptList {...args} />
        </ExtensionAPIProviderForTestsOnly>
    ),
}

export const ErrorMessage: Story = {
    render: args => (
        <ExtensionAPIProviderForTestsOnly
            value={{
                ...MOCK_API,
                prompts: () => {
                    throw new Error('my error')
                },
            }}
        >
            <PromptList {...args} />
        </ExtensionAPIProviderForTestsOnly>
    ),
}
