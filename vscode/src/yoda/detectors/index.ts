import type { Detector } from './Detector'
import { OutdatedSymbolDocumentationDetector } from './ModifiedUndocumentSymbolDetector'
import { TestOpportunityDetector } from './TestOppotrunityDetector'

export const detectors: Detector<any>[] = [
    new OutdatedSymbolDocumentationDetector(),
    new TestOpportunityDetector(),
] as const
