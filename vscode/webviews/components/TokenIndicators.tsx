import { clsx } from 'clsx'
import type React from 'react'
import tokenStyles from './TokenIndicators.module.css'

export const TokenIndicators: React.FunctionComponent<{
    remainingTokens: {
        chat: number
        user: number
        enhanced: number
        maxChat: number
        maxUser: number
        maxEnhanced: number
    }
}> = ({ remainingTokens }) => {
    return (
        <div className={clsx(tokenStyles.tokenIndicators)}>
            <div className={tokenStyles.tokenIndicator}>
                <span className={tokenStyles.tokenLabel}>Chat </span>
                <span className={tokenStyles.tokenProgressContainer}>
                    <progress
                        className={tokenStyles.tokenProgress}
                        value={remainingTokens.chat}
                        max={remainingTokens.maxChat}
                    />
                    <span className={tokenStyles.tokenCount}>{remainingTokens.chat}</span>
                </span>
            </div>
            <div className={tokenStyles.tokenIndicator}>
                <span className={tokenStyles.tokenLabel}>User </span>
                <span className={tokenStyles.tokenProgressContainer}>
                    <progress
                        className={tokenStyles.tokenProgress}
                        value={remainingTokens.user}
                        max={remainingTokens.maxUser}
                    />
                    <span className={tokenStyles.tokenCount}>{remainingTokens.user}</span>
                </span>
            </div>
            <div className={tokenStyles.tokenIndicator}>
                <span className={tokenStyles.tokenLabel}>Enhanced </span>
                <span className={tokenStyles.tokenProgressContainer}>
                    <progress
                        className={tokenStyles.tokenProgress}
                        value={remainingTokens.enhanced}
                        max={remainingTokens.maxEnhanced}
                    />
                    <span className={tokenStyles.tokenCount}>{remainingTokens.enhanced}</span>
                </span>
            </div>
        </div>
    )
}
