import type { Meta, StoryObj } from '@storybook/react'
import type { EditorState } from 'lexical'
import { useState } from 'react'
import { VSCodeStoryDecorator } from '../storybook/VSCodeStoryDecorator'
import { BaseEditor, editorStateToText } from './BaseEditor'
import styles from './BaseEditor.story.module.css'

const meta: Meta<typeof BaseEditor> = {
    title: 'ui/BaseEditor',
    component: BaseEditor,

    args: {
        initialEditorState: null,
        placeholder: 'Placeholder text',
        onChange: () => {},
        className: styles.editor,
    } as React.ComponentProps<typeof BaseEditor>,

    decorators: [VSCodeStoryDecorator],
} as Meta

export default meta

export const Interactive: StoryObj<typeof meta> = {
    render: props => {
        const [editorState, setEditorState] = useState<EditorState | null>(null)
        return (
            <div>
                <div style={{ color: '#fff' }}>
                    <BaseEditor {...props} onChange={setEditorState} />
                </div>
                <div className={styles.stateValue}>
                    {editorState ? editorStateToText(editorState) : ''}
                </div>
                <pre className={styles.stateValue}>{JSON.stringify(editorState ?? {}, null, 2)}</pre>
            </div>
        )
    },
}
