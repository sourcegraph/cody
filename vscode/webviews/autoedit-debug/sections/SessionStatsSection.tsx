import type { FC } from 'react'
import { useMemo } from 'react'
import * as React from 'react'
import type { AutoeditRequestDebugState } from '../../../src/autoedits/debug-panel/debug-store'

// We'll use a simple canvas-based chart implementation
export const SessionStatsSection: FC<{ entry: AutoeditRequestDebugState }> = ({ entry }) => {
    const { sessionStats } = entry
    const { requestMetrics } = sessionStats

    // Calculate p75 e2eLatency
    const p75Latency = calculatePercentile(
        requestMetrics
            .filter(metric => metric.e2eLatency !== undefined && metric.e2eLatency !== null)
            .map(metric => metric.e2eLatency),
        75
    )

    // Calculate p90 e2eLatency
    const p90Latency = calculatePercentile(
        requestMetrics
            .filter(metric => metric.e2eLatency !== undefined && metric.e2eLatency !== null)
            .map(metric => metric.e2eLatency),
        90
    )

    // Calculate p75 inferenceLatency
    const inferenceLatencies = requestMetrics
        .map(metric => metric.inferenceLatency)
        .filter((latency): latency is number => latency !== undefined && latency !== null)

    const p75InferenceLatency = calculatePercentile(inferenceLatencies, 75)

    // Calculate p90 inferenceLatency
    const p90InferenceLatency = calculatePercentile(inferenceLatencies, 90)

    // Calculate mean promptCacheHitRate (excluding undefined/null values)
    const cacheHitRates = requestMetrics
        .map(metric => metric.promptCacheHitRate)
        .filter((rate): rate is number => rate !== undefined && rate !== null)

    const meanCacheHitRate =
        cacheHitRates.length > 0
            ? cacheHitRates.reduce((sum, rate) => sum + rate, 0) / cacheHitRates.length
            : undefined

    // Prepare data for the latency trend graph
    const latencyTrendData = useMemo(() => {
        if (requestMetrics.length < 2) {
            return null
        }

        // Filter out metrics with undefined e2eLatency
        const validMetrics = requestMetrics.filter(
            metric => metric.e2eLatency !== undefined && metric.e2eLatency !== null
        )

        if (validMetrics.length < 2) {
            return null
        }

        // We'll use a sliding window to calculate p75 and p90 over time
        const windowSize = Math.min(10, Math.max(2, Math.floor(validMetrics.length / 5)))
        const dataPoints: Array<{
            index: number
            e2eLatency: number
            inferenceLatency?: number
        }> = []

        for (let i = windowSize; i <= validMetrics.length; i++) {
            const window = validMetrics.slice(i - windowSize, i)
            const e2eLatencies = window
                .map(m => m.e2eLatency)
                .filter((l): l is number => l !== undefined && l !== null)
            const infLatencies = window
                .map(m => m.inferenceLatency)
                .filter((l): l is number => l !== undefined && l !== null)

            if (e2eLatencies.length > 0) {
                dataPoints.push({
                    index: i,
                    e2eLatency: calculatePercentile(e2eLatencies, 75) || 0,
                    inferenceLatency:
                        infLatencies.length > 0 ? calculatePercentile(infLatencies, 75) : undefined,
                })
            }
        }

        return dataPoints
    }, [requestMetrics])

    return (
        <div className="tw-space-y-6">
            <h3 className="tw-text-lg tw-font-medium">Session Statistics</h3>

            <div className="tw-grid tw-grid-cols-1 md:tw-grid-cols-2 lg:tw-grid-cols-4 tw-gap-4">
                <StatCard
                    title="P75 E2E Latency"
                    value={p75Latency !== undefined ? `${p75Latency.toFixed(2)}ms` : 'N/A'}
                    description="75th percentile of end-to-end latency"
                />

                <StatCard
                    title="P90 E2E Latency"
                    value={p90Latency !== undefined ? `${p90Latency.toFixed(2)}ms` : 'N/A'}
                    description="90th percentile of end-to-end latency"
                />

                <StatCard
                    title="P75 Inference Latency"
                    value={
                        p75InferenceLatency !== undefined ? `${p75InferenceLatency.toFixed(2)}ms` : 'N/A'
                    }
                    description="75th percentile of inference latency"
                />

                <StatCard
                    title="P90 Inference Latency"
                    value={
                        p90InferenceLatency !== undefined ? `${p90InferenceLatency.toFixed(2)}ms` : 'N/A'
                    }
                    description="90th percentile of inference latency"
                />

                <StatCard
                    title="Mean Cache Hit Rate"
                    value={meanCacheHitRate !== undefined ? `${meanCacheHitRate.toFixed(2)}%` : 'N/A'}
                    description="Average prompt cache hit rate"
                    className="md:tw-col-span-2 lg:tw-col-span-4"
                />
            </div>

            {/* Latency Trend Graph */}
            {latencyTrendData && latencyTrendData.length > 0 && (
                <div className="tw-mt-6">
                    <h4 className="tw-text-md tw-font-medium tw-mb-3">Latency Trend</h4>
                    <div className="tw-bg-white tw-dark:tw-bg-gray-800 tw-border tw-border-gray-200 tw-dark:tw-border-gray-700 tw-rounded-lg tw-p-4">
                        <LatencyTrendGraph data={latencyTrendData} />
                    </div>
                </div>
            )}

            {/* Request Metrics Summary */}
            <div className="tw-mt-6">
                <h4 className="tw-text-md tw-font-medium tw-mb-2">Request Metrics Summary</h4>
                <div className="tw-text-sm tw-text-gray-500 tw-dark:tw-text-gray-400">
                    Total requests tracked: {requestMetrics.length}
                </div>

                {/* Display recent latencies in a table */}
                {requestMetrics.length > 0 && (
                    <div className="tw-mt-4 tw-overflow-x-auto">
                        <table className="tw-min-w-full tw-divide-y tw-divide-gray-200 tw-dark:tw-divide-gray-700">
                            <thead className="tw-bg-gray-50 tw-dark:tw-bg-gray-800">
                                <tr>
                                    <th
                                        scope="col"
                                        className="tw-px-2 tw-py-2 tw-text-left tw-text-xs tw-font-medium tw-text-gray-500 tw-dark:tw-text-gray-400 tw-uppercase tw-tracking-wider tw-w-16"
                                    >
                                        Req #
                                    </th>
                                    <th
                                        scope="col"
                                        className="tw-px-2 tw-py-2 tw-text-left tw-text-xs tw-font-medium tw-text-gray-500 tw-dark:tw-text-gray-400 tw-uppercase tw-tracking-wider tw-w-24"
                                    >
                                        E2E (ms)
                                    </th>
                                    <th
                                        scope="col"
                                        className="tw-px-2 tw-py-2 tw-text-left tw-text-xs tw-font-medium tw-text-gray-500 tw-dark:tw-text-gray-400 tw-uppercase tw-tracking-wider tw-w-24"
                                    >
                                        Inference (ms)
                                    </th>
                                    <th
                                        scope="col"
                                        className="tw-px-2 tw-py-2 tw-text-left tw-text-xs tw-font-medium tw-text-gray-500 tw-dark:tw-text-gray-400 tw-uppercase tw-tracking-wider tw-w-24"
                                    >
                                        Cache Hit (%)
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="tw-bg-white tw-dark:tw-bg-gray-900 tw-divide-y tw-divide-gray-200 tw-dark:tw-divide-gray-800">
                                {requestMetrics
                                    .slice(0, 10)
                                    .map((metric, idx) => {
                                        // Skip rendering if e2eLatency is undefined or null
                                        if (
                                            metric.e2eLatency === undefined ||
                                            metric.e2eLatency === null
                                        ) {
                                            return null
                                        }

                                        // Create a unique key using the request number and a property from the metric
                                        const uniqueKey = `req-${requestMetrics.length - idx}-${
                                            metric.e2eLatency
                                        }`
                                        return (
                                            <tr
                                                key={uniqueKey}
                                                className={
                                                    idx % 2 === 0
                                                        ? 'tw-bg-gray-50 tw-dark:tw-bg-gray-800/50'
                                                        : ''
                                                }
                                            >
                                                <td className="tw-px-2 tw-py-2 tw-whitespace-nowrap tw-text-sm tw-text-gray-900 tw-dark:tw-text-gray-300">
                                                    {requestMetrics.length - idx}
                                                </td>
                                                <td className="tw-px-2 tw-py-2 tw-whitespace-nowrap tw-text-sm tw-text-gray-900 tw-dark:tw-text-gray-300">
                                                    {metric.e2eLatency.toFixed(2)}
                                                </td>
                                                <td className="tw-px-2 tw-py-2 tw-whitespace-nowrap tw-text-sm tw-text-gray-900 tw-dark:tw-text-gray-300">
                                                    {metric.inferenceLatency !== undefined &&
                                                    metric.inferenceLatency !== null
                                                        ? metric.inferenceLatency.toFixed(2)
                                                        : 'N/A'}
                                                </td>
                                                <td className="tw-px-2 tw-py-2 tw-whitespace-nowrap tw-text-sm tw-text-gray-900 tw-dark:tw-text-gray-300">
                                                    {metric.promptCacheHitRate !== undefined &&
                                                    metric.promptCacheHitRate !== null
                                                        ? `${metric.promptCacheHitRate.toFixed(2)}`
                                                        : 'N/A'}
                                                </td>
                                            </tr>
                                        )
                                    })
                                    .filter(Boolean)}
                            </tbody>
                        </table>
                        {requestMetrics.length > 10 && (
                            <div className="tw-text-xs tw-text-gray-500 tw-mt-2 tw-text-center">
                                Showing 10 most recent requests out of {requestMetrics.length}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

// Helper component for displaying stats
const StatCard: FC<{
    title: string
    value: string
    description: string
    className?: string
}> = ({ title, value, description, className = '' }) => (
    <div
        className={`tw-bg-gray-50 tw-dark:tw-bg-gray-800 tw-rounded-lg tw-p-4 tw-border tw-border-gray-200 tw-dark:tw-border-gray-700 ${className}`}
    >
        <h4 className="tw-text-sm tw-font-medium tw-text-gray-500 tw-dark:tw-text-gray-400">{title}</h4>
        <div className="tw-mt-1 tw-text-2xl tw-font-semibold">{value}</div>
        <p className="tw-mt-1 tw-text-xs tw-text-gray-500 tw-dark:tw-text-gray-400">{description}</p>
    </div>
)

// Latency Trend Graph Component
const LatencyTrendGraph: FC<{
    data: Array<{ index: number; e2eLatency: number; inferenceLatency?: number }>
}> = ({ data }) => {
    const canvasRef = React.useRef<HTMLCanvasElement>(null)

    React.useEffect(() => {
        if (!canvasRef.current || data.length === 0) return

        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        // Set dimensions
        const width = canvas.width
        const height = canvas.height
        const padding = { top: 30, right: 60, bottom: 30, left: 50 }
        const chartWidth = width - padding.left - padding.right
        const chartHeight = height - padding.top - padding.bottom

        // Find max latency for scaling
        const allLatencies = data.flatMap(d => [
            d.e2eLatency,
            d.inferenceLatency !== undefined ? d.inferenceLatency : 0,
        ])
        const maxLatency = Math.max(...allLatencies, 100) * 1.1 // Add 10% padding

        // Draw axes
        ctx.strokeStyle = '#888'
        ctx.lineWidth = 1

        // Y-axis
        ctx.beginPath()
        ctx.moveTo(padding.left, padding.top)
        ctx.lineTo(padding.left, height - padding.bottom)
        ctx.stroke()

        // X-axis
        ctx.beginPath()
        ctx.moveTo(padding.left, height - padding.bottom)
        ctx.lineTo(width - padding.right, height - padding.bottom)
        ctx.stroke()

        // Y-axis labels
        ctx.fillStyle = '#888'
        ctx.font = '10px sans-serif'
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'

        const yTicks = 5
        for (let i = 0; i <= yTicks; i++) {
            const y = padding.top + (chartHeight * i) / yTicks
            const value = maxLatency - (maxLatency * i) / yTicks

            ctx.fillText(`${Math.round(value)}ms`, padding.left - 5, y)

            // Grid line
            ctx.beginPath()
            ctx.strokeStyle = '#eee'
            ctx.moveTo(padding.left, y)
            ctx.lineTo(width - padding.right, y)
            ctx.stroke()
        }

        // X-axis labels
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'

        const xStep = Math.max(1, Math.floor(data.length / 5))
        for (let i = 0; i < data.length; i += xStep) {
            const x = padding.left + (chartWidth * i) / (data.length - 1)
            ctx.fillText(`${data[i].index}`, x, height - padding.bottom + 5)
        }

        // Draw E2E latency line
        ctx.beginPath()
        ctx.strokeStyle = '#3b82f6' // blue-500
        ctx.lineWidth = 2

        for (let i = 0; i < data.length; i++) {
            const x = padding.left + (chartWidth * i) / (data.length - 1)
            const y = padding.top + chartHeight - (chartHeight * data[i].e2eLatency) / maxLatency

            if (i === 0) {
                ctx.moveTo(x, y)
            } else {
                ctx.lineTo(x, y)
            }
        }
        ctx.stroke()

        // Draw E2E latency points
        for (let i = 0; i < data.length; i++) {
            const x = padding.left + (chartWidth * i) / (data.length - 1)
            const y = padding.top + chartHeight - (chartHeight * data[i].e2eLatency) / maxLatency

            ctx.beginPath()
            ctx.fillStyle = '#3b82f6'
            ctx.arc(x, y, 3, 0, Math.PI * 2)
            ctx.fill()
        }

        // Draw inference latency line if available
        const hasInferenceData = data.some(d => d.inferenceLatency !== undefined)

        if (hasInferenceData) {
            ctx.beginPath()
            ctx.strokeStyle = '#10b981' // emerald-500
            ctx.lineWidth = 2

            let firstPoint = true
            for (let i = 0; i < data.length; i++) {
                if (data[i].inferenceLatency === undefined) continue

                const x = padding.left + (chartWidth * i) / (data.length - 1)
                const y =
                    padding.top + chartHeight - (chartHeight * data[i].inferenceLatency!) / maxLatency

                if (firstPoint) {
                    ctx.moveTo(x, y)
                    firstPoint = false
                } else {
                    ctx.lineTo(x, y)
                }
            }
            ctx.stroke()

            // Draw inference latency points
            for (let i = 0; i < data.length; i++) {
                if (data[i].inferenceLatency === undefined) continue

                const x = padding.left + (chartWidth * i) / (data.length - 1)
                const y =
                    padding.top + chartHeight - (chartHeight * data[i].inferenceLatency!) / maxLatency

                ctx.beginPath()
                ctx.fillStyle = '#10b981'
                ctx.arc(x, y, 3, 0, Math.PI * 2)
                ctx.fill()
            }
        }

        // Add legend
        const legendY = padding.top - 15

        // E2E latency legend
        ctx.beginPath()
        ctx.strokeStyle = '#3b82f6'
        ctx.lineWidth = 2
        ctx.moveTo(width - padding.right - 140, legendY)
        ctx.lineTo(width - padding.right - 120, legendY)
        ctx.stroke()

        ctx.fillStyle = '#333'
        ctx.font = '10px sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText('E2E Latency', width - padding.right - 115, legendY + 3)

        if (hasInferenceData) {
            // Inference latency legend
            ctx.beginPath()
            ctx.strokeStyle = '#10b981'
            ctx.lineWidth = 2
            ctx.moveTo(width - padding.right - 60, legendY)
            ctx.lineTo(width - padding.right - 40, legendY)
            ctx.stroke()

            ctx.fillText('Inference Latency', width - padding.right - 35, legendY + 3)
        }
    }, [data])

    return <canvas ref={canvasRef} width={600} height={400} className="tw-w-full tw-h-[400px]" />
}

// Helper function to calculate percentiles
function calculatePercentile(values: number[], percentile: number): number | undefined {
    if (!values || values.length === 0) {
        return undefined
    }

    // Sort values in ascending order
    const sorted = [...values].sort((a, b) => a - b)

    // Calculate the index for the percentile
    const index = Math.ceil((percentile / 100) * sorted.length) - 1

    // Return the value at the calculated index
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))]
}
