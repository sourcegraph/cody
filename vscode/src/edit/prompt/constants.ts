import { ps } from '@sourcegraph/cody-shared'

export const PROMPT_TOPICS = {
    OUTPUT: ps`CODE5711`,
    SELECTED: ps`SELECTEDCODE7662`,
    PRECEDING: ps`PRECEDINGCODE3493`,
    FOLLOWING: ps`FOLLOWINGCODE2472`,
    INSTRUCTIONS: ps`INSTRUCTIONS7390`,
    DIAGNOSTICS: ps`DIAGNOSTICS5668`,
    FILENAME: ps`TESTFILE7041`,
}

export const SMART_APPLY_CUSTOM_PROMPT_TOPICS = {
    USER_QUERY: ps`USER_QUERY`,
    TARGET_CHANGES: ps`TARGET_CHANGES`,
    FULL_FILE_CODE: ps`FULL_FILE_CODE`,
    CODE_TO_UPDATE: ps`CODE_TO_UPDATE`,
    FINAL_CODE: ps`UPDATED_CODE`,
    CODE_TO_UPDATE_LOCATION_MARKER_IN_FULL_FILE_CODE: ps`<<< CODE_TO_UPDATE_LOCATION_IN_THE_FULL_FILE_CODE >>>`,
}

// Check the sourcegraph backend to check the exact model behind the feature flag.
// Link to the model: https://github.com/sourcegraph/sourcegraph/blob/main/cmd/cody-gateway/internal/httpapi/completions/fireworks.go#L358
export const SMART_APPLY_MODEL_IDENTIFIERS = {
    FireworksQwenCodeDefault: 'fireworks::v1::smart-apply-qwen-default',
    FireworksQwenCodeVariant2: 'fireworks::v1::smart-apply-qwen-variant-2',
    FireworksQwenCodeVariant3: 'fireworks::v1::smart-apply-qwen-variant-3',
}
