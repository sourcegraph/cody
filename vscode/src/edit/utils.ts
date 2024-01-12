// This cleans up the code returned by Cody based on current behavior
// ex. Remove  `tags:` that Cody sometimes include in the returned content

import { PROMPT_TOPICS } from './prompt/constants'

// It also removes all spaces before a new line to keep the indentations
export function contentSanitizer(text: string): string {
    const FIXUP_TAG_TOPICS = `(${PROMPT_TOPICS.OUTPUT}|${PROMPT_TOPICS.SELECTED}|${PROMPT_TOPICS.PRECEDING})`
    const FIXUP_TAG_REGEX = new RegExp(`^\\s*<${FIXUP_TAG_TOPICS}>|<\\/${FIXUP_TAG_TOPICS}>\\s*$`, 'g')
    let output = text.replaceAll(FIXUP_TAG_REGEX, '')
    const tagsIndex = text.indexOf('tags:')
    if (tagsIndex !== -1) {
        // NOTE: 6 is the length of `tags:` + 1 space
        output = output.slice(tagsIndex + 6)
    }
    return output.replace(/^\s*\n/, '')
}
