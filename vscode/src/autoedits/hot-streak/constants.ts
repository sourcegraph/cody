/**
 * Minimum number of lines that should be accumulated before attempting a hot streak suggestion.
 * Note: Reaching this number does not guarantee a hot streak suggestion will be emitted.
 * The suggestion should also produce a suitable diff that we can present to the user.
 */
export const SHOULD_ATTEMPT_HOT_STREAK_CHUNK_THRESHOLD = 5

/**
 * Minimum number of lines that should be present in a hot-streak chunk before it is suggested to the user.
 * This is to avoid suggesting a hot-streak chunk that is too small and atomic.
 *
 * Note: This differs from `SHOULD_ATTEMPT_HOT_STREAK_CHUNK_THRESHOLD` in that the chunk is trimmed based on the
 * first stable "unchanged" area. This means that, even if the prediction meets this threshold, the actual chunk may
 * be smaller.
 *
 * Example for the above scenario:
 * 1. LLM produces a response that is 5 lines long, we deem it suitable to attempt a hot-streak chunk.
 * 2. Our diff logic finds that the first line changed, then we had 3 unchanged lines, then 1 changed line.
 * 3. To ensure we can reliably use the hot-streak chunk, our diff logic trims to chunk to the first unchanged area.
 *    This results in a total chunk length of 4.
 * 4. We don't want to use this chunk as it is too small.
 */
export const SHOULD_USE_HOT_STREAK_CHUNK_THRESHOLD = 5
