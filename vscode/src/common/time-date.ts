/**
 * Map of number of seconds to relative time period strings for chat history.
 * Used in getRelativeChatPeriod() to determine time period bucket for a date.
 */
const chatPeriods = new Map<number, string>([
    // today = 1 day = 6 secs * 60 mins * 24 hours
    [86400, 'Today'],
    [604800, 'This week'],
    [2592000, 'This month'],
])

/**
 * Returns a relative time period string for the given date compared to now.
 * If the date is more than 30 days ago, it will return "X months ago".
 */
export function getRelativeChatPeriod(date: Date): string {
    const now = Date.now()
    const seconds = Math.floor((now - date.getTime()) / 1000)

    for (const [unit, period] of chatPeriods.entries()) {
        if (seconds < unit) {
            return period
        }
    }
    // If it's more than 30 days ago, return "n months ago"
    const amount = Math.floor(seconds / 2592000)
    return `${amount} month${amount !== 1 ? 's' : ''} ago`
}
