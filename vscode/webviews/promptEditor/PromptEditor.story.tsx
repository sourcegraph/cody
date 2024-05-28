import type { Meta, StoryObj } from '@storybook/react'
import { type FunctionComponent, useState } from 'react'
import { ContextProvidersDecorator, VSCodeStandaloneComponent } from '../storybook/VSCodeStoryDecorator'
import styles from './BaseEditor.story.module.css'
import {
    PromptEditor,
    type SerializedPromptEditorState,
    serializedPromptEditorStateFromText,
} from './PromptEditor'
import { FILE_MENTION_EDITOR_STATE_FIXTURE } from './fixtures'

const meta: Meta<typeof PromptEditor> = {
    title: 'ui/PromptEditor',
    component: PromptEditor,

    args: {
        initialEditorState: undefined,
        onChange: () => {},
        editorClassName: styles.editor,
    } satisfies React.ComponentProps<typeof PromptEditor>,

    decorators: [VSCodeStandaloneComponent, ContextProvidersDecorator],
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
                initialEditorState={editorState}
                onChange={value => setEditorState(value.editorState)}
            />
            <pre className={styles.stateValue}>{JSON.stringify(editorState, null, 2)}</pre>

            {editorState && (
                <div
                    className={styles.htmlValue}
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: storybooks do not accept user input
                    dangerouslySetInnerHTML={{ __html: editorState.html }}
                />
            )}
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
