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
        initialEditorState: undefined,
        placeholder: 'Placeholder text',
        onChange: () => {},
        className: styles.editor,
    } as React.ComponentProps<typeof BaseEditor>,

    decorators: [VSCodeStoryDecorator],
} as Meta

export default meta

export const Interactive: StoryObj<typeof meta> = {
    render: props => {
        const [editorState, setEditorState] = useState<EditorState | undefined>(props.initialEditorState)
        return (
            <div>
                <div style={{ border: 'solid 1px #333', color: '#fff' }}>
                    <BaseEditor {...props} initialEditorState={editorState} onChange={setEditorState} />
                </div>
                <div
                    style={{
                        marginTop: '2rem',
                        padding: '1rem',
                        backgroundColor: '#333',
                        color: '#ccc',
                        whiteSpace: 'pre',
                    }}
                >
                    {editorState ? editorStateToText(editorState) : ''}
                </div>
                <pre
                    style={{
                        marginTop: '2rem',
                        padding: '1rem',
                        backgroundColor: '#333',
                        color: '#ccc',
                    }}
                >
                    {JSON.stringify(editorState ?? {}, null, 2)}
                </pre>
            </div>
        )
    },
}
