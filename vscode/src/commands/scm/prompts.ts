import { ps } from '@sourcegraph/cody-shared'

const COMMIT_INTRO = ps`Review the following git command output to understand the changes you are about to generate a commit message for.`

const COMMIT_INSTRUCTION = ps`Provide an informative commit message for only the code changes outlined in the shared git diff output.
If provided, the title of the commit message must align with the style of the shared previous commit titles.
{COMMIT_TEMPLATE}
Do not enclose the suggested commit message in backticks. Skip preamble. Only respond with the commit message.`

const COMMMIT_TEMPLATE = ps`The commit message should strictly adhere to the commit format from the shared git commit template.`

const COMMMIT_TEMPLATE_NOT_FOUNT = ps`The commit message should adhere to the conventional commit format`

export const COMMIT_COMMAND_PROMPTS = {
    /**
     * Use as pre-instructions before the context prompts.
     */
    intro: COMMIT_INTRO,
    /**
     * The instruction prompt for the commit command.
     */
    instruction: COMMIT_INSTRUCTION,
    /**
     * The prompt when there is a COMMIT_TEMPLATE found.
     */
    template: COMMMIT_TEMPLATE,
    /**
     * The prompt when COMMIT_TEMPLATE is not found.
     */
    noTemplate: COMMMIT_TEMPLATE_NOT_FOUNT,
}
