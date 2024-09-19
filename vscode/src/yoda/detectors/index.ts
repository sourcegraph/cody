import type { Detector } from './Detector'
// import { OffByOneDetector } from './OffByOneDetector'
// import { OutdatedSymbolDocumentationDetector } from './OutdatedSymbolDocumentationDetector'
import { SQLOptimisationDetector } from './SQLOptimisationDetector'
// import { TestOpportunityDetector } from './TestOppotrunityDetector'

export const detectors: Detector<any>[] = [
    // new OffByOneDetector(),
    // new OutdatedSymbolDocumentationDetector(),
    // new TestOpportunityDetector(),
    new SQLOptimisationDetector(),
] as const
