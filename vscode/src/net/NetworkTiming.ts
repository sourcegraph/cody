import { performance } from 'node:perf_hooks'

export interface RequestPhaseTimings {
    // DNS resolution
    dnsLookupStart?: number
    dnsLookupEnd?: number
    dnsLookupTime?: number

    // Connection establishment
    tcpConnectionStart?: number
    tcpConnectionEnd?: number
    tcpConnectionTime?: number

    // TLS handshake (for HTTPS)
    tlsHandshakeStart?: number
    tlsHandshakeEnd?: number
    tlsHandshakeTime?: number

    // Time to first byte
    ttfbStart?: number
    ttfbEnd?: number
    ttfbTime?: number

    // Total request time
    requestStart: number
    requestEnd?: number
    totalTime?: number

    // Request details
    url: string
    hostname: string
    method: string
    statusCode?: number
    bypassedVSCode?: boolean
    usedCache?: boolean

    // For DNS cache tracking
    dnsResolvedFromCache?: boolean
}

export class NetworkTimingCollector {
    private static activeTimings = new Map<string, RequestPhaseTimings>()

    static startTiming(requestId: string, url: string, method: string): RequestPhaseTimings {
        const urlObj = new URL(url)
        const timing: RequestPhaseTimings = {
            requestStart: performance.now(),
            url,
            hostname: urlObj.hostname,
            method,
        }
        this.activeTimings.set(requestId, timing)
        return timing
    }

    static getTiming(requestId: string): RequestPhaseTimings | undefined {
        return this.activeTimings.get(requestId)
    }

    static finalizeTiming(requestId: string, statusCode?: number): RequestPhaseTimings | undefined {
        const timing = this.activeTimings.get(requestId)
        if (timing) {
            timing.requestEnd = performance.now()
            timing.totalTime = timing.requestEnd - timing.requestStart
            timing.statusCode = statusCode
            this.activeTimings.delete(requestId)
            return timing
        }
        return undefined
    }

    static formatTimingReport(timing: RequestPhaseTimings): string {
        const lines = [`🌐 Network Request: ${timing.method} ${timing.url}`]
        lines.push(`📊 Status: ${timing.statusCode || 'unknown'}`)

        // DNS resolution
        if (timing.dnsLookupTime !== undefined) {
            const cacheInfo = timing.dnsResolvedFromCache ? ' (from cache)' : ''
            lines.push(`🔍 DNS Resolution: ${timing.dnsLookupTime.toFixed(2)}ms${cacheInfo}`)
        }

        // TCP connection
        if (timing.tcpConnectionTime !== undefined) {
            lines.push(`🔌 TCP Connection: ${timing.tcpConnectionTime.toFixed(2)}ms`)
        }

        // TLS handshake
        if (timing.tlsHandshakeTime !== undefined) {
            lines.push(`🔒 TLS Handshake: ${timing.tlsHandshakeTime.toFixed(2)}ms`)
        }

        // TTFB
        if (timing.ttfbTime !== undefined) {
            lines.push(`⏱️ Time to First Byte: ${timing.ttfbTime.toFixed(2)}ms`)
        }

        // Total time
        if (timing.totalTime !== undefined) {
            lines.push(`⏱️ Total Request Time: ${timing.totalTime.toFixed(2)}ms`)
        }

        // Agent configuration
        if (timing.bypassedVSCode !== undefined) {
            lines.push(`⚙️ Used VSCode Network Stack: ${!timing.bypassedVSCode}`)
        }

        return lines.join('\n')
    }
}
