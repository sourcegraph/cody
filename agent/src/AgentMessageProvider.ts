import { ChatMessage, CodyPrompt } from '@sourcegraph/cody-shared'
import { UserLocalHistory } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

import { MessageProvider } from '../../vscode/src/chat/MessageProvider'

import { Agent } from './agent'

export class AgentMessageProvider extends MessageProvider {
    constructor(public agent: Agent) {
        super({} as any)
    }

    // Send transcript to the client
    // TODO: I don't like that this doesn't have any IDs associated with it.
    protected handleTranscript(transcript: ChatMessage[], messageInProgress: boolean): void {
        throw new Error('Method not implemented.')
    }
    protected handleHistory(history: UserLocalHistory): void {
        throw new Error('Method not implemented.')
    }
    protected handleError(errorMsg: string): void {
        throw new Error('Method not implemented.')
    }
    protected handleSuggestions(suggestions: string[]): void {
        throw new Error('Method not implemented.')
    }
    protected handleCodyCommands(prompts: [string, CodyPrompt][]): void {
        throw new Error('Method not implemented.')
    }
    protected handleTranscriptErrors(transciptError: boolean): void {
        throw new Error('Method not implemented.')
    }
}

// type Message = {
//     id: MessageID
//     interaction: Interaction
// }
//
// export abstract class MyProvider {
//     abstract newTranscript(): Promise<string>
//     abstract listTranscripts(): Promise<Transcript[]>
//
//     // Request(client->server): Set active transcript
//     abstract setActiveTranscript(transcriptID: TranscriptID): Promise<Transcript>
//     abstract activeTranscript(): Promise<Transcript | null>
//
//     // Request(client->server): Send a new message from the client for a transcript
//     abstract sendMessage(transcriptID: TranscriptID, interaction: Interaction): Promise<Message>
//
//     // Request(client->server): Edit an existing message in the transcript
//     abstract editMessage(transcriptID: TranscriptID, messageID: MessageID, ineraction: Interaction): Promise<Transcript>
//
//     // Request(client->server): Stop generating the current transcript update
//     abstract cancelTranscriptUpdate(transcriptID: TranscriptID): Promise<void>
//
//     // Notification(server->client): Update a message in the transcript
//     abstract onMessageUpdate(transcriptID: TranscriptID, message: Message, complete: boolean): Promise<void>
// }
