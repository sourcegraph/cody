import { ExtensionAPIProviderForTestsOnly, MOCK_API } from '@sourcegraph/prompt-editor'
import type { Meta, StoryObj } from '@storybook/react'
import { VSCodeStandaloneComponent } from '../../storybook/VSCodeStoryDecorator'
import { PromptList } from './PromptList'

const meta: Meta<typeof PromptList> = {
    title: 'cody/PromptList',
    component: PromptList,
    decorators: [
        story => (
            <div className="tw-border tw-border-border" style={{ width: '700px', margin: '2rem' }}>
                {story()}
            </div>
        ),
        VSCodeStandaloneComponent,
    ],
    args: {
        onSelect: () => {},
        className: '!tw-max-w-[unset]',
    },
}

export default meta

type Story = StoryObj<typeof PromptList>

export const Default: Story = {
    args: {},
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
