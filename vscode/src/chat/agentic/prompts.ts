import { ps } from '@sourcegraph/cody-shared'
import { getOSPromptString } from '../../os'

const REVIEW_PROMPT = ps`Your task is to review the shared context and think step-by-step to determine if you can answer the [QUESTION] at the end.

[INSTRUCTIONS]
1. Analyze the shared context and chat history thoroughly.
2. Decide if you have enough information to answer the question.
3. Respond with ONLY ONE of the following:
    a) The word "CONTEXT_SUFFICIENT" if you can answer the question with the current context.
    b) One or more <TOOL*> tags to request additional information if you do not have the required context to provide a concise answer.

[TOOLS]
In this environment you have access to this set of tools you can use to fetch context before answering the user's question:
{{CODY_TOOLS_PLACEHOLDER}}

[TOOL USAGE EXAMPLES]
{{CODY_TOOLS_EXAMPLES_PLACEHOLDER}}
- To see the full content of a codebase file and context of how the Controller class is use: \`<TOOLFILE><name>path/to/file.ts</name></TOOLFILE><TOOLSEARCH><query>class Controller</query></TOOLSEARCH>\`

[RESPONSE FORMAT]
- If you can answer the question fully, respond with ONLY the word "CONTEXT_SUFFICIENT".
- If you need more information, use ONLY the appropriate <TOOL*> tag(s) in your response. Skip preamble.

[NOTES]
1. Only use <TOOL*> tags when additional context is necessary to answer the question.
2. You may use multiple <TOOL*> tags in a single response if needed.
3. Never request sensitive information such as passwords or API keys.
4. The user is working in the VS Code editor on ${getOSPromptString()}.

[GOAL]
Determine if you can answer the question with the given context, or if you need more information.
Do not provide the actual answer or comments in this step. This is an auto-generated message.`

export const CODYAGENT_PROMPTS = {
    review: REVIEW_PROMPT,
}
