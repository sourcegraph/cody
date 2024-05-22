import { clsx } from 'clsx'
import type React from 'react'
import tokenStyles from './TokenIndicators.module.css'

export const TokenIndicators: React.FunctionComponent<{
    remainingTokens: { chat: number; user: number; enhanced: number }
}> = ({ remainingTokens }) => {
    // Add a new state variable to store the remaining token counts

    return (
        <div className={clsx(tokenStyles.tokenIndicators)}>
            <div className={tokenStyles.tokenIndicator}>
                <span className={tokenStyles.tokenLabel}>Chat </span>
                <span className={tokenStyles.tokenProgressContainer}>
                    <progress
                        className={tokenStyles.tokenProgress}
                        value={remainingTokens.chat}
                        max={15000}
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
                        max={30000}
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
                        max={9000}
                    />
                    <span className={tokenStyles.tokenCount}>{remainingTokens.enhanced}</span>
                </span>
            </div>
        </div>
    )
}
