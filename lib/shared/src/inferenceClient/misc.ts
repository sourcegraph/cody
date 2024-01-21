/**
 * Marks the yielded value as an incomplete response.
 *
 * TODO: migrate to union of multiple `CompletionResponse` types to explicitly document
 * all possible response types.
 */
export const STOP_REASON_STREAMING_CHUNK = 'cody-streaming-chunk'
