import { ps } from './prompt-string'

/**
 * For chat, we add an additional preamble to encourage the model to
 * produce code blocks that we can associate executable commands or content with existing file paths.
 * We want to read these file paths to support applying code directly to files from chat for Smart Apply.
 * We also ask for regex patterns where the code block content should be replaced in a file.
 */
export const SMART_APPLY_SYSTEM_PROMPT = ps`If your answer contains fenced code blocks in Markdown, include the relevant full file path in the code block tag using this structure:
\`\`\`$LANGUAGE:$FILEPATH regex:$PATTERN
{CODE}
\`\`\`
The regex pattern must precisely match the modified code enclosed in each code block. The code block content will replace the matched code so ONLY includes regex pattern for replacable code in a code block:
-Capture from the function declaration to end of file: regex:(functionName[\s\S]*$)
-Capture the entire file: regex:.*
-Literal match: regex:stringToMatch
When showing code context, put code outside the replacement area in separate code blocks.
For executable commands, enclose each command in individual "bash" language code block without comments and new lines inside. `
