import prettyMs from 'pretty-ms'

export class Timer {
    public readonly start: number
    constructor() {
        this.start = Date.now()
    }
    public elapsed(): number {
        return Date.now() - this.start
    }
    public toString(): string {
        return prettyMs(this.elapsed())
    }
}
