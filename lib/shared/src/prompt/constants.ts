/**
 * @deprecated This is temporarily preserved for enterprise users as
 * some users are using older OpenAI models that have a combined input/output window.
 *
 * We need to support configuring the maximum output limit at an instance level.
 * This will allow us to increase this limit whilst still supporting models with a lower output limit.
 * See: https://github.com/sourcegraph/cody/issues/3648#issuecomment-2056954101
 */
export const ANSWER_TOKENS = 1000
export const MAX_CURRENT_FILE_TOKENS = 1000

export const SURROUNDING_LINES = 50
export const NUM_CODE_RESULTS = 12
export const NUM_TEXT_RESULTS = 3

export const MAX_BYTES_PER_FILE = 4096
