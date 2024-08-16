import {
    FILE_MENTION_EDITOR_STATE_FIXTURE,
    OLD_TEXT_FILE_MENTION_EDITOR_STATE_FIXTURE,
    type SerializedPromptEditorState,
    serializedPromptEditorStateFromText,
} from '@sourcegraph/cody-shared'
import { PromptEditor } from '@sourcegraph/prompt-editor'
import type { Meta, StoryObj } from '@storybook/react'
import { type FunctionComponent, useState } from 'react'
import { VSCodeStandaloneComponent } from '../storybook/VSCodeStoryDecorator'
import styles from './BaseEditor.story.module.css'

const meta: Meta<typeof PromptEditor> = {
    title: 'ui/PromptEditor',
    component: PromptEditor,

    args: {
        initialEditorState: undefined,
        onChange: () => {},
        editorClassName: styles.editor,
    } satisfies React.ComponentProps<typeof PromptEditor>,

    decorators: [VSCodeStandaloneComponent],
} as Meta

export default meta

const PromptEditorWithStateValue: FunctionComponent<React.ComponentProps<typeof PromptEditor>> = ({
    initialEditorState: initialValue,
    ...props
}) => {
    const [editorState, setEditorState] = useState<SerializedPromptEditorState | undefined>(initialValue)
    return (
        <div>
            <PromptEditor
                {...props}
                initialEditorState={initialValue}
                onChange={value => setEditorState(value.editorState)}
            />
            <pre className={styles.stateValue}>{JSON.stringify(editorState, null, 2)}</pre>
        </div>
    )
}

export const Interactive: StoryObj<typeof meta> = {
    render: props => <PromptEditorWithStateValue {...props} />,
}

export const WithInitialValue: StoryObj<typeof meta> = {
    render: props => <PromptEditorWithStateValue {...props} />,
    args: { initialEditorState: FILE_MENTION_EDITOR_STATE_FIXTURE },
}

export const WithInitialValueOldTextMentions: StoryObj<typeof meta> = {
    render: props => <PromptEditorWithStateValue {...props} />,
    args: { initialEditorState: OLD_TEXT_FILE_MENTION_EDITOR_STATE_FIXTURE },
}

export const VerticalScroll: StoryObj<typeof meta> = {
    render: props => <PromptEditorWithStateValue {...props} />,
    args: {
        initialEditorState: serializedPromptEditorStateFromText(
            new Array(80)
                .fill(0)
                .map((_, index) => {
                    return `Line ${index}`
                })
                .join('\n')
        ),
    },
}

export const LongLines: StoryObj<typeof meta> = {
    render: props => <PromptEditorWithStateValue {...props} />,
    args: {
        initialEditorState: serializedPromptEditorStateFromText(
            new Array(80)
                .fill(0)
                .map((_, index) => {
                    return `Line ${index}${
                        index % 5 === 0
                            ? 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
                            : ''
                    }`
                })
                .join('\n')
        ),
    },
}
