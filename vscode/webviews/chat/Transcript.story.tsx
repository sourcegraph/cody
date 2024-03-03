import type { Meta, StoryObj } from '@storybook/react'

import { Transcript } from './Transcript'
import type { FileLinkProps } from './components/EnhancedContext'
import { FIXTURE_TRANSCRIPT } from './fixtures'

import { VSCodeStoryDecorator } from '../storybook/VSCodeStoryDecorator'
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
        transcript: FIXTURE_TRANSCRIPT.simple,
    },

    decorators: [VSCodeStoryDecorator],
}

export default meta

const FileLink: React.FunctionComponent<FileLinkProps> = ({ uri }) => <>{uri.toString()}</>

export const Simple: StoryObj<typeof meta> = {
    args: {
        messageInProgress: null,
        messageBeingEdited: undefined,
        setMessageBeingEdited: () => {},
        fileLinkComponent: FileLink,
        transcriptItemClassName: styles.transcriptItem,
        humanTranscriptItemClassName: styles.humanTranscriptItem,
        transcriptItemParticipantClassName: styles.transcriptItemParticipant,
        transcriptActionClassName: styles.transcriptAction,
    },
}
