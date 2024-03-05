import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Chat } from './Chat'
import { FIXTURE_TRANSCRIPT } from './chat/fixtures'
import { VSCodeStoryDecorator, WithBorder } from './storybook/VSCodeStoryDecorator'

const meta: Meta<typeof Chat> = {
    title: 'ui/Chat',
    component: Chat,

    args: {
        transcript: FIXTURE_TRANSCRIPT.simple2,
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
        setContextSelection: () => {},
        userInfo: { isCodyProUser: true, isDotComUser: true },
        isWebviewActive: true,
        vscodeAPI: null as any,
        telemetryService: null as any,
        isTranscriptError: false,
    } as React.ComponentProps<typeof Chat>,

    decorators: [WithBorder, VSCodeStoryDecorator],
} as Meta

export default meta

export const Default: StoryObj<typeof meta> = {
    render: props => {
        const [formInput, setFormInput] = useState(props.formInput)
        return <Chat {...props} formInput={formInput} setFormInput={setFormInput} />
    },
}
