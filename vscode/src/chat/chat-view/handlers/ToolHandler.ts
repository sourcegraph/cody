import type { AgentHandler, AgentHandlerDelegate, AgentRequest } from './interfaces'

export class ToolHandler implements AgentHandler {
    // constructor(private )

    public async handle(
        {
            requestID,
            inputText,
            mentions,
            editorState,
            signal,
            chatBuilder,
            recorder,
            span,
        }: AgentRequest,
        delegate: AgentHandlerDelegate
    ): Promise<void> {}
}
