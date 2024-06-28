import { Writable } from 'node:stream'

/**
 * Wrapper around stdout/stderr streams for testing purposes.
 */
export class Streams {
    public static default(): Streams {
        return new Streams(process.stdout, process.stderr)
    }
    public static buffered(): Streams {
        return new Streams(new StringBufferStream(), new StringBufferStream())
    }
    constructor(
        public readonly stdout: Writable,
        public readonly stderr: Writable
    ) {}
    public write(message: string): void {
        this.stdout.write(message)
    }
    public log(message: string): void {
        this.write(message)
        this.write('\n')
    }
    public error(message: string): void {
        this.stderr.write(message)
        this.stderr.write('\n')
    }
}

/**
 * Write stream that acculumates all written data into a string property `buffer`.
 */
export class StringBufferStream extends Writable {
    public buffer = ''

    _write(chunk: any, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
        this.buffer += chunk.toString()
        callback()
    }
}
