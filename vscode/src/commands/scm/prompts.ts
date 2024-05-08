import { ps } from '@sourcegraph/cody-shared'

const gitCommitIntro = ps`Review the following git command output to understand the changes you are about to generate a commit message for.`

const gitCommitMessage = ps`Suggest an informative commit message along with a details by summarizing the code changes shown in the provided git diff output.
The commit message should follow the conventional commit format and the title should match the style of the shared commit titles when provided. Your goal is to provide meaningful context and a test plan for future code readers based on the shared context.
Do not enclose the suggested commit message in backticks. Skip preamble. Only respond with the commit message.`

export const commitPrompts = {
    /**
     * Use as pre-instructions before the context prompts.
     */
    intro: gitCommitIntro,
    message: gitCommitMessage,
}
