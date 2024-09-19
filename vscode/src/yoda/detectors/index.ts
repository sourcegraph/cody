import type { Detector } from './Detector'
import { OffByOneDetector } from './OffByOneDetector'
import { OutdatedSymbolDocumentationDetector } from './OutdatedSymbolDocumentationDetector'
import { TestOpportunityDetector } from './TestOppotrunityDetector'

export const detectors: Detector<any>[] = [
    new OffByOneDetector(),
    new OutdatedSymbolDocumentationDetector(),
    new TestOpportunityDetector(),
] as const
