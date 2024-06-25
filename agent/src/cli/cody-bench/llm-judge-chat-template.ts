import { type PromptString, ps } from '@sourcegraph/cody-shared'

const template = ps`Response:{{CODY_RESPONSE}}
<|end_of_response|>

Please evaluate the response and provide your feedback in the following format:
<reasoning> Briefly explain whether the response is helpful and correct, unhelpful, or incorrect.</reasoning>
<score> Label the response as "positive" if it's helpful or "negative" if it's not helpful or incomplete.</score>

Note: Consider the response "positive" if it attempts to provide a helpful answer, even with limited context. Label it "negative" if it apologizes for not knowing the answer, lacks access to information, or is incomplete.`

export interface LlmJudgeChatParams {
    response: PromptString
}

export function llmJudgeChatTemplate(params: LlmJudgeChatParams): PromptString {
    return template.replaceAll('{{CODY_RESPONSE}}', params.response)
}
