export enum CodyTaskState {
    /**
     * The task has been created, but not yet started.
     */
    Idle = 'Idle',
    /**
     * The task has been started, but we have not yet received an actionable
     * response from the LLM.
     */
    Working = 'Working',
    /**
     * We have received a response from the LLM, and we intend to apply the
     * response to the document as we receive it.
     * Similar to `applying` but we do not wait for the LLM to finish responding.
     */
    Inserting = 'Inserting',
    /**
     * We have received a complete response from the LLM, and we are in the process
     * of applying the full response to the document.
     */
    Applying = 'Applying',
    /**
     * The response has been applied to the document, and we are satisfied enough to present it to the user.
     * The user hasn't technically accepted it, and they can still act on the response.
     * E.g. Undo the change, Retry the change, View the diff.
     */
    Applied = 'Applied',
    /**
     * Terminal state. The response has been "accepted" by the user. This is either by:
     * - Clicking "Accept" via the CodeLens
     * - Saving the document
     * - Making an edit within the range of the response (implied acceptance)
     */
    Finished = 'Finished',
    /**
     * Terminal state. We received an error somewhere in the process.
     * We present this error to the user, the response can be "discarded" by the user by:
     * - Clicking "Discard" via the CodeLens
     * - Saving the document
     * - Making an edit within the range of the response (implied acceptance)
     */
    Error = 'Error',
    /**
     * Additional state currently only used for the `test` command.
     * This state is used to signify that an Edit is no longer idle, but waiting for
     * some additional information before it is started (e.g. a file name from the LLM)
     */
    Pending = 'Pending',
}
