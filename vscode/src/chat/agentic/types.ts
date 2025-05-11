// filepath: /Users/bwork/dev/cody-wip/vscode/src/chat/agentic/ToolTypes.ts
import type { Span } from '@opentelemetry/api'
import type { ContextItem, ProcessingStep, PromptString } from '@sourcegraph/cody-shared'

/**
 * Configuration interface for CodyTool instances.
 */
export interface CodyToolConfig {
    // The title of the tool. For UI display purposes.
    title: string
    tags: {
        tag: PromptString
        subTag: PromptString
    }
    prompt: {
        instruction: PromptString
        placeholder: PromptString
        examples: PromptString[]
    }

    // Optional metadata for tool-specific information
    metadata?: Record<string, unknown>
}

/**
 * Interface for tool execution status callbacks.
 * Used to track and report tool execution progress.
 */
export interface ToolStatusCallback {
    onUpdate(id: string, content: string): void
    onStream(step: Partial<ProcessingStep>): void
    onComplete(id?: string, error?: Error): void
    onConfirmationNeeded(
        id: string,
        step: Omit<ProcessingStep, 'id' | 'type' | 'state'>
    ): Promise<boolean>
}

/**
 * The interface for a Cody tool. Primarily used to avoid circular dependencies.
 */
export interface ICodyTool {
    readonly config: CodyToolConfig
    getInstruction(): PromptString
    stream(text: string): void
    run(span: Span, cb?: ToolStatusCallback): Promise<ContextItem[]>
    execute(span: Span, queries: string[], callback?: ToolStatusCallback): Promise<ContextItem[]>
    processResponse?(): void
}
