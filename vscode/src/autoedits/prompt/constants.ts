import { ps } from '@sourcegraph/cody-shared'

export const LINT_ERRORS_TAG_OPEN = ps`<lint_errors>`
export const LINT_ERRORS_TAG_CLOSE = ps`</lint_errors>`
export const EXTRACTED_CODE_SNIPPETS_TAG_OPEN = ps`<extracted_code_snippets>`
export const EXTRACTED_CODE_SNIPPETS_TAG_CLOSE = ps`</extracted_code_snippets>`
export const SNIPPET_TAG_OPEN = ps`<snippet>`
export const SNIPPET_TAG_CLOSE = ps`</snippet>`
export const RECENT_SNIPPET_VIEWS_TAG_OPEN = ps`<recently_viewed_snippets>`
export const RECENT_SNIPPET_VIEWS_TAG_CLOSE = ps`</recently_viewed_snippets>`
export const RECENT_EDITS_TAG_OPEN = ps`<diff_history>`
export const RECENT_EDITS_TAG_CLOSE = ps`</diff_history>`
export const RECENT_COPY_TAG_OPEN = ps`<recent_copy>`
export const RECENT_COPY_TAG_CLOSE = ps`</recent_copy>`
export const FILE_TAG_OPEN = ps`<file>`
export const FILE_TAG_CLOSE = ps`</file>`
export const AREA_FOR_CODE_MARKER = ps`<<<AREA_AROUND_CODE_TO_REWRITE_WILL_BE_INSERTED_HERE>>>`
export const AREA_FOR_CODE_MARKER_OPEN = ps`<area_around_code_to_rewrite>`
export const AREA_FOR_CODE_MARKER_CLOSE = ps`</area_around_code_to_rewrite>`
export const CODE_TO_REWRITE_TAG_CLOSE = ps`</code_to_rewrite>`
export const CODE_TO_REWRITE_TAG_OPEN = ps`<code_to_rewrite>`

// Some common prompt instructions
export const SYSTEM_PROMPT = ps`You are an intelligent programmer named CodyBot. You are an expert at coding. Your goal is to help your colleague finish a code change.`
export const BASE_USER_PROMPT = ps`Help me finish a coding change. In particular, you will see a series of snippets from current open files in my editor, files I have recently viewed, the file I am editing, then a history of my recent codebase changes, then current compiler and linter errors, content I copied from my codebase. You will then rewrite the <code_to_rewrite>, to match what you think I would do next in the codebase. Note: I might have stopped in the middle of typing.`
export const FINAL_USER_PROMPT = ps`Now, continue where I left off and finish my change by rewriting "code_to_rewrite":`
export const RECENT_VIEWS_INSTRUCTION = ps`Here are some snippets of code I have recently viewed, roughly from oldest to newest. It's possible these aren't entirely relevant to my code change:\n`
export const JACCARD_SIMILARITY_INSTRUCTION = ps`Here are some snippets of code I have extracted from open files in my code editor. It's possible these aren't entirely relevant to my code change:\n`
export const RECENT_EDITS_INSTRUCTION = ps`Here is my recent series of edits from oldest to newest.\n`
export const LINT_ERRORS_INSTRUCTION = ps`Here are some linter errors from the code that you will rewrite.\n`
export const RECENT_COPY_INSTRUCTION = ps`Here is some recent code I copied from the editor.\n`
export const CURRENT_FILE_INSTRUCTION = ps`Here is the file that I am looking at `
