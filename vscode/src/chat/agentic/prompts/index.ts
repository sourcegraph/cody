import { ORCHESTRATOR_PROMPT } from './executor'
import { PLANNING_PROMPT } from './planning'
import { CONTEXT_REFLECTION_PROMPT } from './reflection'

export const CODYAGENT_PROMPTS = {
    review: CONTEXT_REFLECTION_PROMPT,
    planning: PLANNING_PROMPT,
    orchestrator: ORCHESTRATOR_PROMPT,
}
