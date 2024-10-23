interface IncrementalTextConsumer {
    /**
     * Push new text to the consumer.
     * Text should be incremental but still include the previous text. E.g. "Hel" -> "Hello" -> "Hello, world!"
     */
    update: (content: string) => void

    /**
     * Notify the consumer that the text is complete.
     */
    close: () => void

    /**
     * Notify the consumer about an error.
     */
    error?: (error: Error) => void
}

// Maximum/minimum amount of time to wait between character chunks
const MAX_DELAY_MS = 200
const MIN_DELAY_MS = 5

const MIN_CHAR_CHUNK_SIZE = 1

/**
 * Typewriter class that implements the IncrementalTextConsumer interface.
 * Used to simulate a typing effect by providing text incrementally.
 */
export class Typewriter implements IncrementalTextConsumer {
    private upstreamClosed = false
    private text = ''
    private i = 0
    private interval: ReturnType<typeof setInterval> | undefined

    constructor(private readonly consumer: IncrementalTextConsumer) {}

    /**
     * Gets the next valid slice point that won't break UTF-16 surrogate pairs
     */
    private getNextValidSlicePoint(currentIndex: number, increment: number): number {
        const codePoints = Array.from(this.text)
        const targetIndex = Math.min(codePoints.length, currentIndex + increment)
        return codePoints.slice(0, targetIndex).join('').length
    }

    public update(content: string): void {
        if (this.upstreamClosed) {
            throw new Error('Typewriter already closed')
        }
        if (content === this.text) {
            return
        }
        if (this.text.length >= content.length) {
            throw new Error('Content must be supplied incrementally')
        }
        this.text = content

        if (this.interval) {
            clearInterval(this.interval)
            this.interval = undefined
        }

        const calculatedDelay = MAX_DELAY_MS / (this.text.length - this.i)
        const dynamicDelay = Math.max(calculatedDelay, MIN_DELAY_MS)
        const charChunkSize =
            calculatedDelay < MIN_DELAY_MS
                ? Math.round(MIN_DELAY_MS / calculatedDelay)
                : MIN_CHAR_CHUNK_SIZE

        this.interval = setInterval(() => {
            // Use the new getNextValidSlicePoint method
            this.i = this.getNextValidSlicePoint(this.i, charChunkSize)
            this.consumer.update(this.text.slice(0, this.i))

            if (this.i === this.text.length) {
                clearInterval(this.interval)
                this.interval = undefined

                if (this.upstreamClosed) {
                    this.consumer.close()
                }
            }
        }, dynamicDelay)
    }

    public close(): void {
        this.upstreamClosed = true
    }

    public stop(error?: Error): void {
        if (this.interval) {
            clearInterval(this.interval)
            this.interval = undefined
        }
        if (this.i < this.text.length) {
            this.consumer.update(this.text)
        }
        if (this.upstreamClosed) {
            if (error) {
                if (this.consumer.error) {
                    this.consumer.error(error)
                    return
                }
            }
            this.consumer.close()
        }
    }
}
