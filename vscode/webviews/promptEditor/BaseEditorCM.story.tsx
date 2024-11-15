import { BaseEditorCM } from '@sourcegraph/prompt-editor'
import type { Meta, StoryObj } from '@storybook/react'
import type { EditorState } from 'prosemirror-state'
import { useState } from 'react'
import { VSCodeStandaloneComponent } from '../storybook/VSCodeStoryDecorator'
import styles from './BaseEditor.story.module.css'

const meta: Meta<typeof BaseEditorCM> = {
    title: 'ui/BaseEditorCM',
    component: BaseEditorCM,

    args: {
        initialEditorState: null,
        placeholder: 'Placeholder text',
        onChange: () => {},
        className: styles.editor,
    } as React.ComponentProps<typeof BaseEditorCM>,

    decorators: [VSCodeStandaloneComponent],
} as Meta

export default meta

export const Interactive: StoryObj<typeof meta> = {
    args: {
        placeholder: 'Placeholder text',
    },
    render: props => {
        const [editorState, setEditorState] = useState<EditorState | null>(null)
        return (
            <div>
                <div style={{ color: '#fff' }}>
                    <BaseEditorCM {...props} onChange={editorState => setEditorState(editorState)} />
                </div>
                <pre className={styles.stateValue}>{JSON.stringify(editorState?.toJSON() ?? {}, null, 2)}</pre>
            </div>
        )
    },
}
