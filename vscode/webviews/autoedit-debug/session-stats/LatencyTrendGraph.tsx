import type { FC } from 'react'
import * as React from 'react'
import type { StatisticsEntry } from '../../../src/autoedits/debug-panel/session-stats'

export const LatencyTrendGraph: FC<{
    statsForLastNRequests: StatisticsEntry[]
}> = ({ statsForLastNRequests }) => {
    const data = statsForLastNRequests
        .filter(d => d.endToEndLatencyMs !== undefined)
        .map((entry, index) => ({
            index,
            e2eLatency: entry.endToEndLatencyMs,
            inferenceLatency: entry.inferenceTimeMs,
        }))
        .reverse() as {
        index: number
        e2eLatency: number
        inferenceLatency?: number
    }[]

    const canvasRef = React.useRef<HTMLCanvasElement>(null)

    React.useEffect(() => {
        if (!canvasRef.current || data.length === 0) return

        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        // Handle high-DPI displays like Retina
        const devicePixelRatio = window.devicePixelRatio || 1
        const displayWidth = canvas.clientWidth
        const displayHeight = canvas.clientHeight

        // Set the canvas dimensions to match the display size * device pixel ratio
        canvas.width = displayWidth * devicePixelRatio
        canvas.height = displayHeight * devicePixelRatio

        // Scale the context to account for the device pixel ratio
        ctx.scale(devicePixelRatio, devicePixelRatio)

        // Clear with the new dimensions
        ctx.clearRect(0, 0, displayWidth, displayHeight)

        const width = displayWidth
        const height = displayHeight
        const padding = { top: 30, right: 60, bottom: 30, left: 50 }
        const chartWidth = width - padding.left - padding.right
        const chartHeight = height - padding.top - padding.bottom

        const allLatencies = data.flatMap(d => [
            d.e2eLatency,
            d.inferenceLatency !== undefined ? d.inferenceLatency : 0,
        ])
        const maxLatency = Math.max(...allLatencies, 100) * 1.1

        ctx.strokeStyle = '#888'
        ctx.lineWidth = 1

        ctx.beginPath()
        ctx.moveTo(padding.left, padding.top)
        ctx.lineTo(padding.left, height - padding.bottom)
        ctx.stroke()

        ctx.beginPath()
        ctx.moveTo(padding.left, height - padding.bottom)
        ctx.lineTo(width - padding.right, height - padding.bottom)
        ctx.stroke()

        ctx.fillStyle = '#888'
        ctx.font = '10px sans-serif'
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'

        const yTicks = 5
        for (let i = 0; i <= yTicks; i++) {
            const y = padding.top + (chartHeight * i) / yTicks
            const value = maxLatency - (maxLatency * i) / yTicks

            ctx.fillText(`${Math.round(value)}ms`, padding.left - 5, y)

            ctx.beginPath()
            ctx.strokeStyle = '#eee'
            ctx.moveTo(padding.left, y)
            ctx.lineTo(width - padding.right, y)
            ctx.stroke()
        }

        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'

        const xStep = Math.max(1, Math.floor(data.length / 5))
        for (let i = 0; i < data.length; i += xStep) {
            const x = padding.left + (chartWidth * i) / (data.length - 1)
            ctx.fillText(`${data[i].index}`, x, height - padding.bottom + 5)
        }

        ctx.beginPath()
        ctx.strokeStyle = '#3b82f6'
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

        for (let i = 0; i < data.length; i++) {
            const x = padding.left + (chartWidth * i) / (data.length - 1)
            const y = padding.top + chartHeight - (chartHeight * data[i].e2eLatency) / maxLatency

            ctx.beginPath()
            ctx.fillStyle = '#3b82f6'
            ctx.arc(x, y, 3, 0, Math.PI * 2)
            ctx.fill()
        }

        const hasInferenceData = data.some(d => d.inferenceLatency !== undefined)

        if (hasInferenceData) {
            ctx.beginPath()
            ctx.strokeStyle = '#10b981'
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

        const legendY = padding.top - 15

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
            ctx.beginPath()
            ctx.strokeStyle = '#10b981'
            ctx.lineWidth = 2
            ctx.moveTo(width - padding.right - 60, legendY)
            ctx.lineTo(width - padding.right - 40, legendY)
            ctx.stroke()

            ctx.fillText('Inference Latency', width - padding.right - 35, legendY + 3)
        }
    }, [data])

    return <canvas ref={canvasRef} className="tw-w-full tw-h-[400px]" />
}
