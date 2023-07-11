/**
 * A context hook is a function that is executed to augment the LLM input with additional context.
 */
export interface ContextHook {
    /**
     * Called before the LLM input is sent.
     *
     * @param input The LLM input.
     * @returns The augmented input string.
     */
    run(input: string): string
}

/**
 * Run an array of context hooks sequentially.
 *
 * @param input The LLM input.
 * @returns The augmented input string.
 */
export function runContextHooks(input: string, contextHooks: ContextHook[]): string {
    for (const { run } of contextHooks) {
        input = run(input)
    }
    return input
}
