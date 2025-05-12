/**
 * Minimum number of lines that should be accumulated before attempting a hot streak suggestion.
 * Note: Reaching this number does not guarantee a hot streak suggestion will be emitted.
 * The suggestion should also produce a suitable diff that we can present to the user.
 */
export const SHOULD_ATTEMPT_HOT_STREAK_CHUNK_THRESHOLD = 5

/**
 * The amount of lines that should be present in a stable "unchanged" hunk before it is considered stable.
 * This is to help avoid false positives where the LLM produces new code which we similar to existing code below that
 * we mark as stable.
 *
 * Note: This can be tweaked to improve the stability of the partial diff.
 */
export const SHOULD_USE_STABLE_UNCHANGED_HUNK_THRESHOLD = 3
