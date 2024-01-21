import path from 'path'

import fs from 'fs-extra'
import YAML from 'yaml'

interface Response {
    status: number
    body: any
}

// Implements the exact same API as `API` from '@polly/core' but uses YAML
// instead of JSON. We can't make the functions return Promise because that would
// break compatibility with the original API implementation.
export class PollyYamlWriter {
    constructor(private readonly recordingsDir: string) {}

    public getRecording(recording: string): Response {
        const recordingFilename = this.filenameFor(recording)
        if (fs.existsSync(recordingFilename)) {
            const text = fs.readFileSync(recordingFilename).toString()
            const data = YAML.parse(text)
            return this.respond(200, data)
        }

        return this.respond(204)
    }

    public saveRecording(recording: string, data: any): Response {
        const text = YAML.stringify(data, undefined, { singleQuote: false })
        fs.outputFileSync(this.filenameFor(recording), text)

        return this.respond(201)
    }

    public deleteRecording(recording: string): Response {
        const recordingFilename = this.filenameFor(recording)

        if (fs.existsSync(recordingFilename)) {
            fs.removeSync(recordingFilename)
        }

        return this.respond(200)
    }

    public filenameFor(recording: string): string {
        return path.join(this.recordingsDir, recording, 'recording.har.yaml')
    }

    public respond(status: number, body?: any): Response {
        return { status, body }
    }
}
