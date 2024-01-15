import { type Meta, type StoryObj } from '@storybook/react'

import { type FileLinkProps } from './components/EnhancedContext'
import { FIXTURE_TRANSCRIPT } from './fixtures'
import { Transcript } from './Transcript'

import styles from './Transcript.story.module.css'

const meta: Meta<typeof Transcript> = {
    title: 'ui/Transcript',
    component: Transcript,

    argTypes: {
        transcript: {
            name: 'Transcript fixture',
            options: Object.keys(FIXTURE_TRANSCRIPT),
            mapping: FIXTURE_TRANSCRIPT,
            control: { type: 'select' },
        },
    },
    args: {
        transcript: FIXTURE_TRANSCRIPT[Object.keys(FIXTURE_TRANSCRIPT).sort()[0]],
    },

    decorators: [
        story => <div style={{ maxWidth: '600px', margin: '2rem auto', border: 'solid 1px #ccc' }}>{story()}</div>,
    ],
}

export default meta

const FileLink: React.FunctionComponent<FileLinkProps> = ({ uri }) => <>{uri.toString()}</>

export const Simple: StoryObj<typeof meta> = {
    args: {
        messageInProgress: null,
        messageBeingEdited: false,
        setMessageBeingEdited: () => {},
        fileLinkComponent: FileLink,
        transcriptItemClassName: styles.transcriptItem,
        humanTranscriptItemClassName: styles.humanTranscriptItem,
        transcriptItemParticipantClassName: styles.transcriptItemParticipant,
        transcriptActionClassName: styles.transcriptAction,
    },
}
