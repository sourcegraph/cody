/**
 * A context hook is a function that is executed to augment the LLM input with additional context.
 */
export interface ContextHook {
    /**
     * Called before the LLM input is sent.
     *
     * @param input The current LLM input.
     * @returns The augmented input string.
     */
    run(input: string): string
}
