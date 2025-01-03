import { ps } from '@sourcegraph/cody-shared'
import { getOSPromptString } from '../../os'

export const ACTIONS_TAGS = {
    ANSWER: ps`next_step`,
    CONTEXT: ps`context_list`,
}

const REVIEW_PROMPT = ps`Your task is to evaluate the shared context and think step-by-step to determine if you can answer user's request enclosed inside the <user_input> tags below.

## INSTRUCTIONS
1. Analyze the shared context and chat history thoroughly.
2. Decide if you have enough information to answer <user_input>.

## TOOLS
In this environment you have access to this set of tools you can use to fetch context before answering:
- {{CODY_TOOLS_PLACEHOLDER}}

## EXPECTED VALID OUTPUT
1. Add the evaluated context that you need for certain in order to answer the <user_input> concisely with <{{CONTEXT_TAG}}> tags, with the filename in between:
    - DO NOT add context that was not shared to the list.
    - DO NOT include EMPTY <{{CONTEXT_TAG}}> list.
    <example_response>
        <{{CONTEXT_TAG}}>shared/file1.ts</{{CONTEXT_TAG}}><{{CONTEXT_TAG}}>shared/file2.ts</{{CONTEXT_TAG}}><{{CONTEXT_TAG}}>command</{{CONTEXT_TAG}}>
    <example_response>
2. If you can answer the <user_input> fully with the context added to <{{CONTEXT_TAG}}>, add "<{{ANSWER_TAG}}>" at the end:
    <example_response>
        <{{CONTEXT_TAG}}>path/to/file1.ts</{{CONTEXT_TAG}}><{{CONTEXT_TAG}}>path/to/file2.ts</{{CONTEXT_TAG}}><{{CONTEXT_TAG}}>command</{{CONTEXT_TAG}}><{{ANSWER_TAG}}>
    <example_response>
3. If you need more information, use ONLY the appropriate <TOOL*> tag(s) in your response:
    <example_response>
        <TOOLFILE><name>path/to/file.ts</name></TOOLFILE><TOOLSEARCH><query>class Controller</query></TOOLSEARCH>
    <example_response>
4. If you can answer the <user_input> fully without context, respond with ONLY the word "<{{ANSWER_TAG}}>":
    <example_response>
        <{{ANSWER_TAG}}>
    <example_response>
5. If you can answer the <user_input> fully without context, but need to use tool per <user_input>:
    <example_response>
        <TOOLMEMORY><store>user's preferences</store></TOOLMEMORY><{{ANSWER_TAG}}>
    <example_response>

## INVALIDE OUTPUT EXAMPLES
- Empty context list: \`<{{CONTEXT_TAG}}></{{CONTEXT_TAG}}>\`
- Include non tags values (comments or explanations) in the response: \`<{{ANSWER_TAG}}> YOUR EXPLANATION\`
- <{{CONTEXT_TAG}}> includes context that was not shared: \`<{{CONTEXT_TAG}}>not-shared-context</{{CONTEXT_TAG}}>\`

## GOALS
- Determine if you can answer the question with the given context, or if you need more information.
- Your response should only contains the <{{CONTEXT_TAG}}> list, and either the word "<{{ANSWER_TAG}}>" OR the appropriate <TOOL*> tag(s) and NOTHING else.

## RULES
1. Only use <TOOL*> tags when additional context is necessary to answer the question.
2. You may use multiple <TOOL*> tags in a single response if needed.
3. Never make assumption about the provided context.
4. NEVER request sensitive information or files such as passwords, API keys, or env files.
5. The user is working in the {{CODY_IDE}} on ${getOSPromptString()}.

<user_input>
{{USER_INPUT_TEXT}}
<user_input>

## IMPORTANT
Skip preamble. ONLY include the expected tags in your response and nothing else.
This is an auto-generated message and your response will be processed by a bot using the expected tags.`
    .replace(/{{ANSWER_TAG}}/g, ACTIONS_TAGS.ANSWER)
    .replace(/{{CONTEXT_TAG}}/g, ACTIONS_TAGS.CONTEXT)

export const CODYAGENT_PROMPTS = {
    review: REVIEW_PROMPT,
}
