import { FeatureFlag } from '@sourcegraph/cody-shared'
import type { FunctionComponent } from 'react'
import { useFeatureFlag } from '../utils/useFeatureFlags'

interface TokenUsageDisplayProps {
    tokenUsage?: {
        completionTokens?: number
        promptTokens?: number
        totalTokens?: number
    }
}

export const TokenUsageDisplay: FunctionComponent<TokenUsageDisplayProps> = ({ tokenUsage }) => {
    const enableTokenLogs = useFeatureFlag(FeatureFlag.EnableTokenLogs)

    if (
        !enableTokenLogs ||
        !tokenUsage ||
        (!tokenUsage.completionTokens && !tokenUsage.promptTokens && !tokenUsage.totalTokens)
    ) {
        return null
    }

    return (
        <div className="tw-text-xs tw-text-muted-foreground tw-flex tw-gap-4 tw-whitespace-nowrap">
            {tokenUsage.completionTokens !== undefined && (
                <span>Completion tokens: {tokenUsage.completionTokens}</span>
            )}
            {tokenUsage.promptTokens !== undefined && (
                <span>Prompt tokens: {tokenUsage.promptTokens}</span>
            )}
            {tokenUsage.totalTokens !== undefined && <span>Total tokens: {tokenUsage.totalTokens}</span>}
        </div>
    )
}
