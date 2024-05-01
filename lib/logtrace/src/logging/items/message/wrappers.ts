import type { Span } from '@opentelemetry/api'
import { isError } from 'lodash'
import type { Jsonify as JsonifyType } from 'type-fest'

export class ErrorWrapper<T extends Error = Error> {
    private constructor(public original: T) {}

    public static wrap<T extends Error>(
        original: T | unknown | undefined | null
    ): ErrorWrapper<T> | null {
        if (!original || !isError(original)) {
            return null
        }
        return new ErrorWrapper(original as T)
    }

    private static jsonify<T extends Error>(err: T | unknown): ErrorJson | null {
        if (!err || !isError(err)) {
            return null
        }
        return {
            _type: 'ErrorWrapper',
            _original: err,
            name: err.name,
            message: err.message,
            cause: err.cause ? ErrorWrapper.jsonify(err.cause) ?? null : undefined,
            stack: err.stack,
        }
    }
    public toJSON(): ErrorJson {
        return ErrorWrapper.jsonify(this.original)!
    }
}

interface _ErrorJson {
    _type: 'ErrorWrapper'
    //only exists local in the process that it created. Will not be serialized/deserialized when sent to other processes
    _original?: Error
    name: string
    message: string
    cause?: _ErrorJson | null
    stack?: string
}
export type ErrorJson = JsonifyType<_ErrorJson>

// #region secret

export class SecretWrapper {
    private constructor(private original: any) {}

    public static wrap(original: any) {
        return new SecretWrapper(original)
    }

    public get safe() {
        const type = typeof this.original
        let isBlank = this.original === null || this.original === undefined
        switch (type) {
            case 'string':
                isBlank = this.original?.toString().trim().length === 0
                break
            case 'object':
                isBlank = Object.keys(this.original ?? {}).length === 0
        }
        return {
            type,
            isBlank,
        }
    }

    public toJSON(): SecretJson {
        return {
            _type: 'SecretWrapper',
            safe: this.safe,
        }
    }
}

export type SecretJson = JsonifyType<{
    _type: 'SecretWrapper'
    safe: {
        type: string
        /**
         * Leaking booleans isn't really a concern. But it's really useful to know
         * if a string or an object was empty
         */
        isBlank: boolean
    }
}>

// #region span

export class SpanWrapper {
    private constructor(public readonly span: Span) {}

    public static wrap(span: Span | undefined | null): SpanWrapper | null {
        if (!span) {
            return null
        }
        return new SpanWrapper(span)
    }

    public toJSON() {
        const { traceId, spanId } = this.span.spanContext()
        return { traceId, spanId }
    }
}
