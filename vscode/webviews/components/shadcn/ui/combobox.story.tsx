import { useArgs } from '@storybook/preview-api'
import type { Meta, StoryObj } from '@storybook/react'
import { VSCodeStandaloneComponent } from '../../../storybook/VSCodeStoryDecorator'
import { ComboBox } from './combobox'

const meta: Meta<typeof ComboBox> = {
    title: 'cody/ComboBox',
    component: ComboBox,
    decorators: [VSCodeStandaloneComponent],
    args: {
        options: ['apple', 'banana', 'cod', 'dates'].map(item => ({ title: item, value: item })),
        pluralNoun: 'food',
        __storybook__open: true,
    },
    render: args => {
        const [, updateArgs] = useArgs()
        return (
            <ComboBox
                {...args}
                onChange={value => {
                    updateArgs({ value })
                }}
            />
        )
    },
}

export default meta

type Story = StoryObj<typeof ComboBox>

export const Default: Story = {}

export const Grouped: Story = {
    args: {
        options: [
            { title: 'apple', value: 'apple', group: 'Fruit' },
            { title: 'banana', value: 'banana', group: 'Fruit' },
            { title: 'cod', value: 'cod', group: 'Fish' },
            { title: 'dolphin', value: 'dates', group: 'Fish' },
        ],
    },
}
