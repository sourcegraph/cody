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
                        // Toggle between submittable and busy
                        state: args.state === 'submittable' ? 'waitingResponseComplete' : 'submittable',
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
            options: ['submittable', 'waitingResponseComplete'],
            control: { type: 'radio' },
        },
    },
}

export const EmptyEditor: StoryObj<typeof meta> = {
    args: {
        state: 'emptyEditorValue',
    },
}
