import { SQLOptimisationDetector } from './SQLOptimisationDetector'
import { TestOpportunityDetector } from './TestOppotrunityDetector'

export const detectors = [new TestOpportunityDetector(), new SQLOptimisationDetector()] as const
