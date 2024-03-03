import type { Meta, StoryObj } from '@storybook/react'
import type { EditorState } from 'lexical'
import { useState } from 'react'
import { VSCodeStoryDecorator } from '../storybook/VSCodeStoryDecorator'
import { RichEditor, editorStateToText } from './RichEditor'
import styles from './RichEditor.story.module.css'

const meta: Meta<typeof RichEditor> = {
    title: 'ui/RichEditor',
    component: RichEditor,

    args: {
        initialEditorState: undefined,
        placeholder: 'Placeholder text',
        onChange: () => {},
        className: styles.editor,
    } as React.ComponentProps<typeof RichEditor>,

    decorators: [VSCodeStoryDecorator],
} as Meta

export default meta

export const Interactive: StoryObj<typeof meta> = {
    render: props => {
        const [editorState, setEditorState] = useState<EditorState | undefined>(props.initialEditorState)
        return (
            <div>
                <div style={{ border: 'solid 1px #333', color: '#fff' }}>
                    <RichEditor {...props} initialEditorState={editorState} onChange={setEditorState} />
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
