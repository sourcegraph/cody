import { useArgs } from '@storybook/preview-api'
import type { Meta, StoryObj } from '@storybook/react'
import { VSCodeStandaloneComponent } from '../../../../../../storybook/VSCodeStoryDecorator'
import { SubmitButton } from './SubmitButton'

const meta: Meta<typeof SubmitButton> = {
    title: 'ui/SubmitButton',
    component: SubmitButton,

    args: {
        onClick: () => {},
        isEditorFocused: true,
    },

    decorators: [VSCodeStandaloneComponent],

    render: () => {
        const [args, setArgs] = useArgs()
        return (
            <SubmitButton
                {...args}
                onClick={() => {
                    setArgs({
                        disabled: true,
                    })
                    setTimeout(() => setArgs({ disabled: false }), 3000)
                }}
            />
        )
    },
}

export default meta

export const Default: StoryObj<typeof meta> = {
    args: {},
}
