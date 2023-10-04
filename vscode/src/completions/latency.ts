import { logDebug } from '../log'

export const defaultLatency = {
    baseline: 400,
    user: 200,
    lowPerformance: 1000,
    max: 2000,
}

// Languages with lower performance get additional latency to avoid spamming users with unhelpful suggestions
export const lowPerformanceLanguageIds = new Set([
    'css',
    'html',
    'scss',
    'vue',
    'dart',
    'json',
    'yaml',
    'postcss',
    'markdown',
    'plaintext',
    'xml',
])

let userMetrics = {
    sessionTimestamp: 0,
    currentLatency: 0,
    suggested: 0,
    fsPath: '',
}

// Adjust the minimum latency based on user actions and env
// Start when the last 5 suggestions were not accepted
// Increment latency by 200ms linearly up to max latency
// Reset every 5 minutes, or on file change, or on accepting a suggestion
export function getLatency(provider: string, fsPath: string, languageId?: string, isComment?: boolean): number {
    // set base latency based on provider and low performance languages or comments when available
    let baseline = provider === 'anthropic' ? 0 : defaultLatency.baseline
    const isLowPerformance = languageId && lowPerformanceLanguageIds.has(languageId)
    if (!languageId || isLowPerformance || isComment) {
        baseline = defaultLatency.lowPerformance
    }

    const timestamp = Date.now()
    if (!userMetrics.sessionTimestamp) {
        userMetrics.sessionTimestamp = timestamp
    }

    const elapsed = timestamp - userMetrics.sessionTimestamp
    // reset metrics and timer after 5 minutes or file change
    if (elapsed >= 5 * 60 * 1000 || userMetrics.fsPath !== fsPath) {
        resetLatency()
    }

    userMetrics.suggested++
    userMetrics.fsPath = fsPath

    const total = Math.max(baseline, Math.min(baseline + userMetrics.currentLatency, defaultLatency.max))

    // Increase latency linearly up to max after 5 rejected suggestions
    if (userMetrics.suggested >= 5 && userMetrics.currentLatency < defaultLatency.max) {
        userMetrics.currentLatency += defaultLatency.user
    }

    logDebug('CodyCompletionProvider:getLatency', `Latency Applied: ${total}`)

    return total
}

// reset user latency and counter:
// - on acceptance
// - every 5 minutes
// - on file change
export function resetLatency(): void {
    userMetrics = {
        sessionTimestamp: 0,
        currentLatency: 0,
        suggested: 0,
        fsPath: '',
    }
    logDebug('CodyCompletionProvider:resetLatency', 'Latency Reset')
}

// Checks if a line is a comment based on the language ID.
export function isLineComment(trimmedLine: string, languageId?: string): boolean {
    if (!languageId || !trimmedLine) {
        return false
    }

    switch (languageId) {
        case 'lua':
            return trimmedLine.startsWith('--')
        case 'shellscript':
        case 'perl':
        case 'r':
            return trimmedLine.startsWith('#')
        case 'ocaml':
            return trimmedLine.startsWith('(*')
        case 'powershell':
            return trimmedLine.startsWith('<#')
        case 'python':
            return trimmedLine.startsWith('#') || trimmedLine.startsWith('"""')
        case 'ruby':
            return trimmedLine.startsWith('#') || trimmedLine.startsWith('=begin')
        // javascript', 'typescript', 'typescriptreact', 'javascriptreact', 'java', 'c', 'cpp', 'csharp', 'go', 'scala', 'swift', 'rust', 'php', 'objectivec'
        // use '//', '/*', '*/'. '*'
        default:
            return trimmedLine.startsWith('/') || trimmedLine.startsWith('*') || trimmedLine.startsWith('<!') // html and react
    }
}
