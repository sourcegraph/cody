import { type PromptString, ps } from '@sourcegraph/cody-shared'

const template = ps`You are an AI judge tasked with evaluating the quality of an automated code fix made by an AI coding assistant. The assistant was given a piece of code with a diagnostic (error message) and attempted to fix the code to resolve the diagnostic.

Here is the code before the fix:
<code_before>
{{CODE_BEFORE_FIX}}
</code_before>

Here is the diagnostic before the fix:
<diagnostic_before>
{{DIAGNOSTIC_BEFORE_FIX}}
</diagnostic_before>

Here is the code after the fix:
<code_after>
{{CODE_AFTER_FIX}}
</code_after>

Here are any diagnostics remaining after the fix (if this section is empty, there are no remaining diagnostics):
<diagnostics_after>
{{DIAGNOSTICS_AFTER_FIX}}
</diagnostics_after>

Please analyze the code before and after, and the diagnostic before and after, to determine the quality of the fix.

First, write out your brief reasoning and analysis in a <reasoning> section. Discuss whether the fix fully resolved the original diagnostic, whether it introduced any new issues or diagnostics, and the overall quality and appropriateness of the code changes made.

Then, score the fix as "bad", "acceptable", or "amazing" in a <score> section. Use the following criteria:

- "bad" if the fix did not resolve the original diagnostic at all, or if it introduced major new issues
- "acceptable" if the fix resolved the original diagnostic but has minor remaining issues or inelegant code
- "amazing" if the fix fully resolved the diagnostic with clean, efficient, and appropriate code changes

Remember, provide your <reasoning> first, then your <score>.`

interface LlmJudgeFixParams {
    codeBeforeFix: PromptString
    diagnosticBeforeFix: PromptString
    codeAfterFix: PromptString
    diagnosticsAfterFix?: PromptString
}

export function llmJudgeFixTemplate(params: LlmJudgeFixParams): PromptString {
    return template
        .replaceAll('{{CODE_BEFORE_FIX}}', params.codeBeforeFix)
        .replaceAll('{{DIAGNOSTIC_BEFORE_FIX}}', params.diagnosticBeforeFix)
        .replaceAll('{{CODE_AFTER_FIX}}', params.codeAfterFix)
        .replaceAll('{{DIAGNOSTICS_AFTER_FIX}}', params.diagnosticsAfterFix ?? ps``)
}
