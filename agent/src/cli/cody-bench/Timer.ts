import prettyMs from 'pretty-ms'

export class Timer {
    public readonly start: number
    constructor() {
        this.start = performance.now()
    }
    public elapsed(): number {
        return performance.now() - this.start
    }
    public toString(): string {
        return prettyMs(this.elapsed())
    }
}
