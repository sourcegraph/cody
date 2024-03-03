import type { Meta, StoryObj } from '@storybook/react'
import type { SerializedLexicalNode } from 'lexical'
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

const PromptEditorWithStateValue: React.FunctionComponent<React.ComponentProps<typeof PromptEditor>> = ({
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

const FILE_MENTION_VALUE_FIXTURE: PromptEditorValue = {
    v: 1,
    editorState: {
        root: {
            children: [
                {
                    children: [
                        {
                            detail: 0,
                            format: 0,
                            mode: 'normal',
                            style: '',
                            text: 'What does ',
                            type: 'text',
                            version: 1,
                        },
                        {
                            detail: 1,
                            format: 0,
                            mode: 'token',
                            style: '',
                            text: '@file-a-0.py',
                            type: 'mention',
                            version: 1,
                            mentionName: 'file-a-0.py',
                        },
                        {
                            detail: 0,
                            format: 0,
                            mode: 'normal',
                            style: '',
                            text: ' do?',
                            type: 'text',
                            version: 1,
                        },
                    ],
                    direction: 'ltr',
                    format: '',
                    indent: 0,
                    type: 'paragraph',
                    version: 1,
                } as SerializedLexicalNode,
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            type: 'root',
            version: 1,
        },
    },
    text: 'What does @file-a-0.py do?',
}

export const Interactive: StoryObj<typeof meta> = {
    render: props => <PromptEditorWithStateValue {...props} />,
}

export const WithInitialValue: StoryObj<typeof meta> = {
    render: props => <PromptEditorWithStateValue {...props} />,
    args: { initialValue: FILE_MENTION_VALUE_FIXTURE },
}
