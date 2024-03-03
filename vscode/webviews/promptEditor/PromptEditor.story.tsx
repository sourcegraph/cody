import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { VSCodeStoryDecorator } from '../storybook/VSCodeStoryDecorator'
import styles from './BaseEditor.story.module.css'
import { PromptEditor, type PromptEditorValue } from './PromptEditor'

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

export const Interactive: StoryObj<typeof meta> = {
    render: props => {
        const [value, setValue] = useState<PromptEditorValue | null>(props.initialValue)
        return (
            <div>
                <div>
                    <PromptEditor {...props} initialValue={value} onChange={setValue} />
                </div>
                <pre className={styles.stateValue}>{JSON.stringify(value ?? {}, null, 2)}</pre>
            </div>
        )
    },
}
