import type { Meta, StoryObj } from '@storybook/react'
import { type FunctionComponent, useState } from 'react'
import { VSCodeStoryDecorator } from '../storybook/VSCodeStoryDecorator'
import styles from './BaseEditor.story.module.css'
import { PromptEditor, type PromptEditorValue } from './PromptEditor'
import { FILE_MENTION_VALUE_FIXTURE } from './fixtures'

const meta: Meta<typeof PromptEditor> = {
    title: 'ui/PromptEditor',
    component: PromptEditor,

    args: {
        initialValue: null,
        onChange: () => {},
        className: styles.editor,
        chatEnabled: true,
        isNewChat: true,
    } as React.ComponentProps<typeof PromptEditor>,

    decorators: [VSCodeStoryDecorator],
} as Meta

export default meta

const PromptEditorWithStateValue: FunctionComponent<React.ComponentProps<typeof PromptEditor>> = ({
    initialValue,
    ...props
}) => {
    const [value, setValue] = useState<PromptEditorValue | null>(initialValue)
    return (
        <div>
            <div>
                <PromptEditor {...props} initialValue={value} onChange={setValue} />
            </div>
            <pre className={styles.stateValue}>{JSON.stringify(value ?? {}, null, 2)}</pre>
        </div>
    )
}

export const Interactive: StoryObj<typeof meta> = {
    render: props => <PromptEditorWithStateValue {...props} />,
}

export const WithInitialValue: StoryObj<typeof meta> = {
    render: props => <PromptEditorWithStateValue {...props} />,
    args: { initialValue: FILE_MENTION_VALUE_FIXTURE },
}
