import { type Unsubscribable, distinctUntilChanged } from '../../misc/observable'
import type { InteractiveThreadService } from './session'

export function createAgentForInteractiveThread(
    threadService: InteractiveThreadService,
    threadID: string
): Unsubscribable {
    const thread = threadService.observe(threadID, {})
    return thread.pipe(distinctUntilChanged()).subscribe(async thread => {
        console.log('SUB')
        const lastStep = thread.steps.at(-1)
        const newHumanMessage = lastStep && lastStep.type === 'human-message' ? lastStep : null
        if (newHumanMessage) {
            await sleep(500)
            threadService.update(threadID, {
                type: 'append-agent-message',
                content: 'Hello from the agent',
            })

            await sleep(500)
            threadService.update(threadID, {
                type: 'append-agent-message',
                content: 'Hello from the agent',
            })
        }
    })
}

async function sleep(msec: number) {
    return new Promise(resolve => setTimeout(resolve, msec))
}
