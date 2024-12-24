import type { Span } from '@opentelemetry/api'
import {
    PromptString,
    type RankedContext,
    type SerializedPromptEditorState,
    getContextForChatMessage,
    inputTextWithoutContextChipsFromPromptEditorState,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import { resolveContextItems } from '../../editor/utils/editor-context'
import { type ChatControllerOptions, combineContext } from './ChatController'
import { type ContextRetriever, toStructuredMentions } from './ContextRetriever'
import { type HumanInput, getPriorityContext } from './context'

const agentRegister = new Map<string, AgentHandler>()

export const registerAgent = (id: string, handler: AgentHandler) => agentRegister.set(id, handler)

export function getAgent(
    id: string,
    contextRetriever: ContextRetriever,
    editor: ChatControllerOptions['editor']
): AgentHandler {
    if (!agentRegister.has(id)) {
        // If id is not found, assume it's a base model
        return new ChatHandler(id, contextRetriever, editor)
    }
    return agentRegister.get(id)!
}

/**
 * Interface for the agent to post messages back to the user
 */
interface AgentHandlerDelegate {
    postStatusUpdate(id: number, type: string, statusMessage: string): void
    postMessage(id: number, message: string): void
    postDone(status: 'success' | 'error' | 'canceled'): void
}

interface AgentHandler {
    handle(delegate: AgentHandlerDelegate): void
}

export class ChatHandler implements AgentHandler {
    constructor(
        private modelId: string,
        private contextRetriever: ContextRetriever,
        private readonly editor: ChatControllerOptions['editor']
    ) {}

    public handle(delegate: AgentHandlerDelegate): void {
        throw new Error('Method not implemented.')
        // NEXT: update args list, invoke computeContext and then stream response
    }

    private postError(error: Error): void {
        throw new Error('Method not implemented.')
    }

    private async computeContext(
        { text, mentions }: HumanInput,
        requestID: string,
        editorState: SerializedPromptEditorState | null,
        span: Span,
        signal?: AbortSignal
    ): Promise<RankedContext[]> {
        try {
            return wrapInActiveSpan('chat.computeContext', span => {
                return this._computeContext({ text, mentions }, requestID, editorState, span, signal)
            })
        } catch (e) {
            this.postError(new Error(`Unexpected error computing context, no context was used: ${e}`))
            return [
                {
                    strategy: 'none',
                    items: [],
                },
            ]
        }
    }

    private async _computeContext(
        { text, mentions }: HumanInput,
        requestID: string,
        editorState: SerializedPromptEditorState | null,
        span: Span,
        signal?: AbortSignal
    ): Promise<RankedContext[]> {
        // Remove context chips (repo, @-mentions) from the input text for context retrieval.
        const inputTextWithoutContextChips = editorState
            ? PromptString.unsafe_fromUserQuery(
                  inputTextWithoutContextChipsFromPromptEditorState(editorState)
              )
            : text
        const structuredMentions = toStructuredMentions(mentions)
        const retrievedContextPromise = this.contextRetriever.retrieveContext(
            structuredMentions,
            inputTextWithoutContextChips,
            span,
            signal
        )
        const priorityContextPromise = retrievedContextPromise
            .then(p => getPriorityContext(text, this.editor, p))
            .catch(() => getPriorityContext(text, this.editor, []))
        const openCtxContextPromise = getContextForChatMessage(text.toString(), signal)
        const [priorityContext, retrievedContext, openCtxContext] = await Promise.all([
            priorityContextPromise,
            retrievedContextPromise.catch(e => {
                this.postError(new Error(`Failed to retrieve search context: ${e}`))
                return []
            }),
            openCtxContextPromise,
        ])

        const resolvedExplicitMentionsPromise = resolveContextItems(
            this.editor,
            [structuredMentions.symbols, structuredMentions.files, structuredMentions.openCtx].flat(),
            text,
            signal
        )

        return [
            {
                strategy: 'local+remote',
                items: combineContext(
                    await resolvedExplicitMentionsPromise,
                    openCtxContext,
                    priorityContext,
                    retrievedContext
                ),
            },
        ]
    }
}
