import { type PromptString, ps } from '@sourcegraph/cody-shared'
interface LlmJudgeChatParams {
    response: PromptString
}

const helpfulnessTemplate = ps`Response:{{CODY_RESPONSE}}
<|end_of_response|>

Please evaluate the response and provide your feedback in the following format:
<reasoning> Briefly explain whether the response is helpful and correct vs. unhelpful or incorrect.</reasoning>
<score> Label the response as "positive" if it's helpful or "negative" if it's not helpful or incomplete.</score>

Note: Consider the response "positive" if it attempts to provide a helpful answer, even with limited context. Label it "negative" if it is incomplete, or does not contain informative content.`

export function helpfulnessPrompt(params: LlmJudgeChatParams): PromptString {
    return helpfulnessTemplate.replaceAll('{{CODY_RESPONSE}}', params.response)
}

const concisenessTemplate = ps`Response:{{CODY_RESPONSE}}
<|end_of_response|>

Please evaluate the response and provide your feedback in the following format:
<reasoning> Briefly explain whether the response is concise and to-the-point vs. long-winded or verbose.</reasoning>
<score> Label the response as "positive" if it's concise or "negative" if it is long-winded.</score>

Note: Consider the response "positive" if each sentence is informative. Label it "negative" if it is repetitive or contains 'filler' content that doesn't convey new information.`

export function concisenessPrompt(params: LlmJudgeChatParams): PromptString {
    return concisenessTemplate.replaceAll('{{CODY_RESPONSE}}', params.response)
}
