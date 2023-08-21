export interface IncrementalTextConsumer {
    /**
     * Push new text to the consumer.
     * Text should be incremental but still include the previous text. E.g. "Hel" -> "Hello" -> "Hello, world!"
     */
    update: (content: string) => void

    /**
     * Notify the consumer that the text is complete.
     */
    close: () => void
}

// This is a ~700 WPM typing speed. Most people read much faster than they type.
const DELAY_MS = 85

// Not all languages have spaces, and we don't have a word breaker, so use
// chunks of characters. This is prime to reduce the likelihood we get an "n
// columns" effect of successive chunks.
const CHARS_PER_CHUNK_WITHOUT_SPACES = 7

// For languages with spaces, this prefers whitespaces as break points but will
// skip short words.
const re = /\S{3,}\s+/g

export class Typewriter implements IncrementalTextConsumer {
    private upstreamClosed = false
    private resolveFinished: (s: string) => void = () => {}
    private rejectFinished: (err: any) => void = () => {}

    /**
     * Promise indicating the typewriter is done "typing". Resolved with the
     * complete text when available; rejects if the typewriter was stopped
     * prematurely.
     */
    public readonly finished: Promise<string>

    private text = ''
    private i = 0
    private interval: ReturnType<typeof setInterval> | undefined

    /**
     * Creates a Typewriter which will buffer incremental text and pass it
     * through to `consumer` simulating a typing effect.
     *
     * @param consumer the consumer to pipe "typing" through to.
     */
    constructor(private readonly consumer: IncrementalTextConsumer) {
        this.finished = new Promise((resolve, reject) => {
            this.resolveFinished = resolve
            this.rejectFinished = reject
        })
    }

    // IncrementalTextConsumer implementation. The "write" side of the pipe.

    public update(content: string): void {
        if (this.upstreamClosed) {
            throw new Error('Typewriter already closed')
        }
        if (this.text.length >= content.length) {
            throw new Error('Content must be supplied incrementally')
        }
        this.text = content

        if (!this.interval) {
            this.interval = setInterval(() => this.type(), DELAY_MS)
        }
    }

    public close(): void {
        this.upstreamClosed = true
        this.attemptFinish()
    }

    /** Stop the typewriter, immediately emit any remaining text */
    public stop(): void {
        // Stop the animation
        if (this.interval) {
            clearInterval(this.interval)
            this.interval = undefined
        }
        // Flush any pending content to the consumer.
        if (this.i < this.text.length) {
            this.consumer.update(this.text)
        }
        // Clean up the consumer, finished promise.
        if (this.upstreamClosed) {
            this.consumer.close()
            this.resolveFinished(this.text)
        } else {
            this.rejectFinished(new Error('Typewriter stopped'))
        }
    }

    // Manages clearing the interval if there is no more text to output.
    // Closes the downstream consumer once all text has been typed.
    private attemptFinish(): void {
        if (this.i === this.text.length) {
            if (this.interval) {
                clearInterval(this.interval)
                this.interval = undefined
            }
            if (this.upstreamClosed) {
                this.consumer.close()
                this.resolveFinished(this.text)
            }
        }
    }

    private type(): void {
        // Pick the next index to type up to
        let next = this.i + CHARS_PER_CHUNK_WITHOUT_SPACES
        if (next >= this.text.length) {
            next = this.text.length
        } else {
            re.lastIndex = this.i
            re.exec(this.text) // updates re.lastIndex to the end of the match
            if (re.lastIndex) {
                next = re.lastIndex
            }
        }

        // Do the update, if any
        if (next > this.i) {
            this.i = next
            this.consumer.update(this.text.slice(0, this.i))
        }

        // Clean up
        this.attemptFinish()
    }
}
