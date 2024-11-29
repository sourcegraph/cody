import { telemetryRecorder } from '@sourcegraph/cody-shared'

export class ThreadOccupancyMonitor {
    private lastMeasurement: number = performance.now()
    private measurements: number[] = []
    private measurementInterval: NodeJS.Timeout | null = null

    // Sample interval in ms (e.g. every 1 minute)
    private readonly SAMPLE_INTERVAL = 60_000
    // How many samples to keep for rolling average
    private readonly SAMPLE_WINDOW = 6

    start(): void {
        if (this.measurementInterval) {
            return
        }

        this.measurementInterval = setInterval(() => {
            this.measure()
        }, this.SAMPLE_INTERVAL)
    }

    stop(): void {
        if (this.measurementInterval) {
            clearInterval(this.measurementInterval)
            this.measurementInterval = null
        }
    }

    private measure(): void {
        const now = performance.now()
        const elapsed = now - this.lastMeasurement
        this.lastMeasurement = now

        // Get CPU usage for the main thread
        const cpuUsage = process.cpuUsage()
        const userCPUMs = cpuUsage.user / 1000 // Convert to ms
        const systemCPUMs = cpuUsage.system / 1000

        // Calculate occupancy as percentage
        const occupancy = ((userCPUMs + systemCPUMs) / elapsed) * 100

        // Keep rolling window of measurements
        this.measurements.push(occupancy)
        if (this.measurements.length > this.SAMPLE_WINDOW) {
            this.measurements.shift()
        }

        // Emit telemetry with the current measurement
        this.emitTelemetry(occupancy)
    }

    private emitTelemetry(occupancy: number): void {
        telemetryRecorder.recordEvent('cody.performance', 'threadOccupancy', {
            metadata: {
                occupancyPercent: Math.round(occupancy),
                rollingAveragePercent: Math.round(
                    this.measurements.reduce((a, b) => a + b, 0) / this.measurements.length
                )
            }
        })
    }
}