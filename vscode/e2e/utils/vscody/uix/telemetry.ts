import type { telemetryEvents } from '@sourcegraph/cody-shared'
import { isArray } from 'lodash'
import type { LiteralUnion } from 'type-fest'
import type { UIXContextFnContext } from '.'
import type { RecordedTelemetryEvent } from '../fixture/telemetry'

export type TelemetrySignature = keyof typeof telemetryEvents
export type TelemetryAction = SplitSignature<TelemetrySignature>[1]
export type TelemetryFeature = SplitSignature<TelemetrySignature>[0]

type Options = Pick<UIXContextFnContext, 'telemetryRecorder'>
type Ctx = {
    start?: number
    end?: number
} & Options
export class TelemetrySnapshot {
    private constructor(private ctx: Ctx) {}

    static fromNow(opts: Options) {
        return new TelemetrySnapshot({ ...opts, start: opts.telemetryRecorder.all.length })
    }

    static untilNow(opts: Options) {
        return new TelemetrySnapshot({ ...opts, start: 0, end: opts.telemetryRecorder.all.length })
    }

    /**
     * Returns a new stopped snapshot but keeps the original one running. If a
     * previous snapshot is passed in the new snapshot starts after the last one
     * was taken.
     */
    snap(previous?: TelemetrySnapshot): TelemetrySnapshot {
        return new TelemetrySnapshot({
            ...this.ctx,
            start: previous?.ctx.end ?? this.ctx.start,
            end: this.ctx.telemetryRecorder.all.length,
        })
    }

    /**
     * Freezes this telemetry snapshot and returns
     */
    stop(): TelemetrySnapshot {
        this.ctx.end = this.ctx.end ?? this.ctx.telemetryRecorder.all.length
        return this
    }

    get events() {
        return this.ctx.telemetryRecorder.all.slice(this.ctx.start ?? 0, this.ctx.end ?? undefined)
    }

    filter({
        matching,
        notMatching,
    }: {
        signature?: MatchFn | PropMatchFnOpts | PropMatchFnOpts[]
        matching?: MatchFn | PropMatchFnOpts | PropMatchFnOpts[]
        notMatching?: MatchFn | PropMatchFnOpts | PropMatchFnOpts[]
    }) {
        function apply(
            input: RecordedTelemetryEvent[],
            m: MatchFn | PropMatchFnOpts | PropMatchFnOpts[] | undefined,
            shouldMatch = true
        ) {
            if (m === undefined) {
                return input
            }
            if (typeof m === 'function') {
                return input.filter(v => m(v) === shouldMatch)
            }
            const propMatcher = isArray(m) ? m : [m]
            const matcherFn = propMatchFn(...propMatcher)
            return input.filter(v => matcherFn(v) === shouldMatch)
        }
        let filtered = this.events
        filtered = apply(filtered, matching)
        filtered = apply(filtered, notMatching, false)
        return filtered
    }
}

export type MatchFn = (event: RecordedTelemetryEvent) => boolean
export interface PropMatchFnOpts {
    signature?: LiteralUnion<TelemetrySignature, string>
    feature?: LiteralUnion<TelemetryFeature, string>
    action?: LiteralUnion<TelemetryAction, string>
}
function propMatchFn(...opts: PropMatchFnOpts[]): MatchFn {
    return ({ event }) => {
        for (const opt of opts) {
            const matchesSignature =
                opt.signature !== undefined ? opt.signature === `${event.feature}/${event.action}` : true
            const matchesFeature = opt.feature !== undefined ? opt.feature === event.feature : true
            const matchesAction = opt.action !== undefined ? opt.action === event.action : true

            if (matchesFeature && matchesAction && matchesSignature) {
                return true
            }
        }
        return false
    }
}

type SplitSignature<S extends string, D extends string = '/'> = string extends S
    ? string[]
    : S extends ''
      ? []
      : S extends `${infer T}${D}${infer U}`
        ? [T, ...SplitSignature<U, D>]
        : [S]
