import type { ConfigurationWithAccessToken } from '../configuration'
import { SourcegraphGraphQLAPIClient } from '../sourcegraph-api/graphql'
import { isError } from '../utils'

import { Transcript } from './transcript'
import type { ChatMessage } from './transcript/messages'

type ClientInitConfig = Pick<
    ConfigurationWithAccessToken,
    | 'serverEndpoint'
    | 'codebase'
    | 'useContext'
    | 'accessToken'
    | 'customHeaders'
>

interface ClientInit {
    config: ClientInitConfig
    setMessageInProgress: (messageInProgress: ChatMessage | null) => void
    setTranscript: (transcript: Transcript) => void
    initialTranscript?: Transcript
}

export interface Client {
    readonly transcript: Transcript
    reset: () => void
    sourcegraphStatus: { authenticated: boolean; version: string }
    codyStatus: { enabled: boolean; version: string }
    graphqlClient: SourcegraphGraphQLAPIClient
}

export async function createClient({
    config,
    setMessageInProgress,
    setTranscript,
    initialTranscript,
}: ClientInit): Promise<Client | null> {
    const fullConfig = { debugEnable: false, ...config }

    const graphqlClient = new SourcegraphGraphQLAPIClient(fullConfig)
    const sourcegraphVersion = await graphqlClient.getSiteVersion()

    const sourcegraphStatus = { authenticated: false, version: '' }
    if (!isError(sourcegraphVersion)) {
        sourcegraphStatus.authenticated = true
        sourcegraphStatus.version = sourcegraphVersion
    }

    const codyStatus = await graphqlClient.isCodyEnabled()

    if (sourcegraphStatus.authenticated && codyStatus.enabled) {
        const transcript = initialTranscript || new Transcript()

        let isMessageInProgress = false

        const sendTranscript = (data?: any): void => {
            if (isMessageInProgress) {
                const messages = transcript.toChat()
                setTranscript(transcript)
                const message = messages.at(-1)!
                if (data) {
                    message.data = data
                }
                setMessageInProgress(message)
            } else {
                setTranscript(transcript)
                if (data) {
                    setMessageInProgress({ data, speaker: 'assistant' })
                } else {
                    setMessageInProgress(null)
                }
            }
        }

        return {
            get transcript() {
                return transcript
            },
            reset() {
                isMessageInProgress = false
                transcript.reset()
                sendTranscript()
            },
            sourcegraphStatus,
            codyStatus,
            graphqlClient,
        }
    }

    return null
}
