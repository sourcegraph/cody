import type { Meta, StoryObj } from '@storybook/react'
import type { EditorState } from 'lexical'
import { useState } from 'react'
import { RichEditor, editorStateToText } from './RichEditor'

const meta: Meta<typeof RichEditor> = {
    title: 'ui/RichEditor',
    component: RichEditor,

    args: {
        initialEditorState: undefined,
        setEditorState: () => {},
    } as React.ComponentProps<typeof RichEditor>,

    decorators: [
        story => (
            <div
                style={{
                    maxWidth: '600px',
                    margin: '2rem auto',
                }}
            >
                <style>{'body { font-family: system-ui; }'}</style>
                {story()}
            </div>
        ),
    ],
} as Meta

export default meta

export const Interactive: StoryObj<typeof meta> = {
    render: props => {
        const [editorState, setEditorState] = useState<EditorState | undefined>(props.initialEditorState)
        return (
            <div>
                <div style={{ border: 'solid 1px #ccc' }}>
                    <RichEditor
                        {...props}
                        initialEditorState={editorState}
                        setEditorState={setEditorState}
                    />
                </div>
                <div
                    style={{
                        marginTop: '2rem',
                        padding: '1rem',
                        backgroundColor: '#eee',
                        whiteSpace: 'pre',
                    }}
                >
                    {editorState ? editorStateToText(editorState) : ''}
                </div>
                <pre style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#eee' }}>
                    {JSON.stringify(editorState ?? {}, null, 2)}
                </pre>
            </div>
        )
    },
}
