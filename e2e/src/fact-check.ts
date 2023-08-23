import { DetectedEntity, detectEntities } from './entity-detection'
import { detectHallucinations } from './hallucinations'

export interface FactCheck {
    missingFacts: string[]
    detectedEntities: DetectedEntity[]
    hallucinatedEntities: DetectedEntity[]
}

export async function factCheck(codebase: string, facts: string[], answer: string): Promise<FactCheck> {
    // TODO: Fact can be a Regexp.
    const missingFacts = []

    for (const fact of facts) {
        if (!answer.includes(fact)) {
            missingFacts.push(fact)
        }
    }
    const detectedEntities = detectEntities(answer)
    const hallucinatedEntities = await detectHallucinations(codebase, detectedEntities)

    return { missingFacts, detectedEntities, hallucinatedEntities }
}
