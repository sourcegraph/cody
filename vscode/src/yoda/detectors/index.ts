import { MissingDocumentationDetector } from './MissingDocumentationDetector'
import { TestOpportunityDetector } from './TestOppotrunityDetector'

export const detectors = [new TestOpportunityDetector(), new MissingDocumentationDetector()] as const
