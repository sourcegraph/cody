import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Chat } from './Chat'
import { VSCodeStoryDecorator } from './storybook/VSCodeStoryDecorator'

const meta: Meta<typeof Chat> = {
    title: 'cody/Chat',
    component: Chat,

    args: {
        transcript: [
            { speaker: 'assistant', displayText: 'Hello from Cody!' },
            { speaker: 'human', displayText: 'Hi from human.' },
        ],
        messageInProgress: null,
        messageBeingEdited: undefined,
        setMessageBeingEdited: () => {},
        formInput: '',
        setFormInput: () => {},
        inputHistory: [],
        setInputHistory: () => {},
        chatIDHistory: [],
        onSubmit: () => {},
        isCodyEnabled: true,
        chatEnabled: true,
        userInfo: { isCodyProUser: true, isDotComUser: true },
        isWebviewActive: true,
        vscodeAPI: null as any,
        telemetryService: null as any,
        isTranscriptError: false,
    } as React.ComponentProps<typeof Chat>,

    decorators: [
        VSCodeStoryDecorator,
        story => <div style={{ background: 'rgb(28, 33, 40)' }}>{story()}</div>,
    ],
} as Meta

export default meta

export const Default: StoryObj<typeof meta> = {
    render: props => {
        const [formInput, setFormInput] = useState(props.formInput)
        return <Chat {...props} formInput={formInput} setFormInput={setFormInput} />
    },
}
