import { type Attributes, type Context, type Link, type SpanKind, trace } from '@opentelemetry/api'
import {
    type Sampler,
    SamplingDecision,
    type SamplingResult,
    type SpanExporter,
} from '@opentelemetry/sdk-trace-base'

export class CodyTailSampler implements SpanExporter {
    public export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
        const rootSpans = sortByHrTime(this.nestSpans(spans))

        for (const rootSpan of rootSpans) {
            this.logSpanTree(rootSpan)
        }

        resultCallback({ code: ExportResultCode.SUCCESS })
    }

    public shutdown(): Promise<void> {
        return Promise.resolve()
    }
}

// export class CodySampler implements Sampler {
//     constructor(private readonly isTracingEnabled: boolean) {}

//     shouldSample(
//         context: Context,
//         traceId: string,
//         spanName: string,
//         spanKind: SpanKind,
//         attributes: Attributes,
//         links: Link[]
//     ): SamplingResult {
//         console.log({
//             traceId,
//             spanName,
//             spanKind,
//             attributes,
//             links,
//         })
//         if (isSampled(spanName, attributes)) {
//             console.log('HELL YE')
//         }
//         // if (spanName === 'autocomplete.provideInlineCompletionItems') {
//         //     debugger
//         // }
//         const anyParentSampled = isAnyParentSampled(context)
//         return {
//             decision:
//                 this.isTracingEnabled && anyParentSampled
//                     ? SamplingDecision.RECORD_AND_SAMPLED
//                     : SamplingDecision.NOT_RECORD,
//         }
//     }

//     toString(): string {
//         return `CodySampler{isTracingEnabled: ${this.isTracingEnabled}}`
//     }
// }

function isSampled(spanName: string, attributes: Attributes) {
    // Autocomplete is special-cased here because we decide wether or not to
    // sample something after the sample has started. To do this, we always
    // upload the sample to the OTel Collector and rely on the tail-sampling
    // there
    if (spanName === 'autocomplete.provideInlineCompletionItems') {
        return true
    }
    if (attributes.sampled) {
        return true
    }
    return false
}

function isAnyParentSampled(context: Context): boolean {
    let span = trace.getSpan(context)
    while (span !== undefined) {
        console.log(span)
        span = undefined
    }
    return false
}
