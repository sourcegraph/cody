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
                        // Toggle between default and busy
                        state: args.state === 'default' ? 'isPendingPriorResponse' : 'default',
                    })
                }}
            />
        )
    },
}

export default meta

export const Default: StoryObj<typeof meta> = {
    args: {},
    argTypes: {
        state: {
            options: ['default', 'isPendingPriorResponse'],
            control: { type: 'radio' },
        },
    },
}

export const EmptyEditor: StoryObj<typeof meta> = {
    args: {
        state: 'emptyEditorValue',
    },
}
