let cachedValue: boolean | undefined

export function hardcodeNonessentialNetworkTraffic(): boolean {
    if (import.meta?.env?.CODY_DEV_HARDCODE_SOME_NETWORK_REQUESTS === 'true') {
        cachedValue = true
    } else {
        cachedValue = Boolean(process.env.CODY_DEV_HARDCODE_SOME_NETWORK_REQUESTS)
    }
    return false
}
