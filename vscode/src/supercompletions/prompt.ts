import { ps, psDedent } from '@sourcegraph/cody-shared'

export const MODEL = 'anthropic/claude-3-haiku-20240307'

export const SYSTEM = psDedent`
    You are Cody, an AI coding assistant from Sourcegraph. You are an expert at
    suggesting next updates to code. You will receive the latest source file inside
    a <source/> XML tag and the most recent change that lead to that source file in
    git diff format inside a <recent-change/> XML tag.

    Your task is to do two things:

    1. Infer the high-level task the user is trying to complete by reading the
       recent change. Summarize the task briefly inside a <task/> tag. Use git
       commit message title best practices to format the summary. Use this to guide
       the next step.
    2. Generate the next changes for the user inside <next-change/> tags. For each
       next change, start by writing down a brief summary of the proposed change
       inside a <summary/> tag. Then, write the suggested change inside the
       <change/> tag. Format the change using a line based diff format that first
       copies the original chunks of the code to be replaced from the source file
       and then suggests the updated chunks. Only include lines that need to be
       changed with the addition of one context line before and after in the
       original chunk. Include the full whitespace as seen in the source file for
       every line you copy. You should ensure the proposed updates match the
       indentation and code style of the user's source code. Propose only new
       changes.

    Here is an example on how to format a change:

    <change>
    <<<<<<< ORIGINAL
    ____function flip(bool) {
    ________return bool;
    ____}
    =======
    ____function flip(bool) {
    ________return !bool;
    ____}
    >>>>>>> UPDATED
    </change>
`

export const PROMPT = psDedent`
    <source file="{filename}">
    {source}
    </source>
    <recent-change>
    {git-diff}
    </recent-change>
`

export const HUMAN_EXAMPLE = PROMPT.replaceAll('{filename}', ps`magic.ts`)
    .replaceAll(
        '{source}',
        psDedent`
            function main() {
            ____function getMagicNumber(): string {
            ________return "thirteen";
            ____}
            ____console.log(getMagicString());
            }
        `
    )
    .replaceAll(
        '{git-diff}',
        psDedent`
            --- a/magic.ts
            +++ b/magic.ts
            @@ -1,3 +1,3 @@
             function main() {
            -____function getMagicString(): string {
            +____function getMagicNumber(): string {
             ________return "thirteen";
             ____}
             ____console.log(getMagicString());
        `
    )

export const ASSISTANT_EXAMPLE = psDedent`
    <task>Update getMagicString to getMagicNumber</task>

    <next-change>
    <summary>Update the return type and value to number</summary>
    <change>
    <<<<<<< ORIGINAL
    ____function getMagicNumber(): string {
    ________return "thirteen";
    ____}
    =======
    ____function getMagicNumber(): number {
    ________return 13;
    ____}
    >>>>>>> UPDATED
    </change>
    </next-change>

    <next-change>
    <summary>Update the call site to match the new function name</summary>
    <change>
    <<<<<<< ORIGINAL
    ____}
    ____console.log(getMagicString());
    }
    =======
    ____}
    ____console.log(getMagicNumber());
    }
    >>>>>>> UPDATED
    </change>
    </next-change>
`
