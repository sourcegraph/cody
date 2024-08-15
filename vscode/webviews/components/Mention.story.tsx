import {
    MENTION_CLASS_NAME,
    StandaloneMentionComponent,
    useSetGlobalPromptEditorConfig,
} from '@sourcegraph/prompt-editor'
import type { Meta, StoryObj } from '@storybook/react'
import { AtSignIcon } from 'lucide-react'
import { VSCodeDecorator } from '../storybook/VSCodeStoryDecorator'

const MentionWrapper: typeof StandaloneMentionComponent = props => {
    useSetGlobalPromptEditorConfig()
    return <StandaloneMentionComponent {...props} />
}

const meta: Meta<typeof MentionWrapper> = {
    title: 'ui/MentionComponent',
    component: MentionWrapper,
    decorators: [VSCodeDecorator('tw-p-5 tw-max-w-[180px] tw-overflow-hidden')],
    args: {
        text: 'My mention',
        className: MENTION_CLASS_NAME,
        icon: AtSignIcon,
    },
}

export default meta

type Story = StoryObj<typeof MentionWrapper>

export const Default: Story = {}

export const LongTitle: Story = {
    args: {
        text: 'This is a very long title, yes it is very – long!',
    },
}
