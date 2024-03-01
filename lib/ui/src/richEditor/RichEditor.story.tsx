import type { Meta, StoryObj } from '@storybook/react'
import { RichEditor } from './RichEditor'

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
                    border: 'solid 1px #ccc',
                    fontFamily: 'system-ui',
                }}
            >
                {story()}
            </div>
        ),
    ],
} as Meta

export default meta

export const Default: StoryObj<typeof meta> = {}
