import { DetectedEntity, detectEntities } from './entity-detection'
import { detectHallucinations } from './hallucinations'
import { Fact } from './test-cases'

export interface FactCheck {
    missingFacts: Fact[]
    detectedEntities: DetectedEntity[]
    hallucinatedEntities: DetectedEntity[]
}

export async function factCheck(codebase: string, facts: Fact[], answer: string): Promise<FactCheck> {
    const missingFacts: Fact[] = []

    for (const fact of facts) {
        switch (fact.type) {
            case 'literal':
                if (!answer.toLowerCase().includes(fact.value.toLowerCase())) {
                    missingFacts.push(fact)
                }
                break
            case 'regex':
                if (!new RegExp(fact.value).test(answer.toLowerCase())) {
                    missingFacts.push(fact)
                }
                break
        }
    }
    const detectedEntities = detectEntities(answer)
    const hallucinatedEntities = await detectHallucinations(codebase, detectedEntities)

    return { missingFacts, detectedEntities, hallucinatedEntities }
}
