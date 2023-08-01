export interface IntentClassificationOption<Intent = string> {
    /**
     * An identifier for this intent.
     * This is what will be returned by the classifier.
     */
    id: Intent
    /**
     * A description for this intent.
     * Be specific in order to help the LLM understand the intent.
     */
    description: string
    /**
     * Example prompts that match this intent.
     * E.g. for a documentation intent: "Add documentation for this function"
     */
    examplePrompts: string[]
}

export interface IntentDetector {
    isCodebaseContextRequired(input: string): Promise<boolean | Error>
    isEditorContextRequired(input: string): boolean | Error
    classifyIntentFromOptions<Intent extends string>(
        input: string,
        options: IntentClassificationOption<Intent>[],
        fallback: Intent
    ): Promise<Intent>
}
