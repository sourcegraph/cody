import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Chat } from './Chat'
import { TextArea } from './chat/TextArea'

const meta: Meta<typeof Chat> = {
    title: 'ui/Chat',
    component: Chat,

    args: {
        transcript: [],
        messageInProgress: null,
        messageBeingEdited: undefined,
        setMessageBeingEdited: () => {},
        formInput: '',
        setFormInput: () => {},
        inputHistory: [],
        setInputHistory: () => {},
        chatIDHistory: [],
        onSubmit: () => {},
        textAreaComponent: TextArea,
        submitButtonComponent: () => <button type="submit">Submit</button>,
        fileLinkComponent: () => <div>fileLinkComponent</div>,
        symbolLinkComponent: () => <div>symbolLinkComponent</div>,
        isCodyEnabled: true,
        chatEnabled: true,
        setContextSelection: () => {},
        userInfo: { isCodyProUser: true, isDotComUser: true },
        isWebviewActive: true,
    } as React.ComponentProps<typeof Chat>,

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

export const Default: StoryObj<typeof meta> = {
    render: props => {
        const [formInput, setFormInput] = useState(props.formInput)
        return <Chat {...props} formInput={formInput} setFormInput={setFormInput} />
    },
}
