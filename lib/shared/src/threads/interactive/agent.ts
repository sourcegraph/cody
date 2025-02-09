import { type Unsubscribable, distinctUntilChanged } from '../../misc/observable'
import { type InteractiveThreadService, type ThreadID, newThreadStepID } from './session'

export function createAgentForInteractiveThread(
    threadService: InteractiveThreadService,
    threadID: ThreadID
): Unsubscribable {
    const thread = threadService.observe(threadID, {})
    return thread.pipe(distinctUntilChanged()).subscribe(async thread => {
        const lastStep = thread.steps.at(-1)
        const newHumanMessage = lastStep && lastStep.type === 'human-message' ? lastStep : null
        if (newHumanMessage) {
            await sleep(500)
            threadService.update(threadID, {
                type: 'append-agent-steps',
                steps: [
                    {
                        id: newThreadStepID(),
                        type: 'agent-message',
                        content: 'Let me see what files already exist.',
                    },
                ],
            })
            await sleep(500)
            threadService.update(threadID, {
                type: 'append-agent-steps',
                steps: [
                    {
                        id: newThreadStepID(),
                        type: 'read-files',
                        files: [
                            'index.ts',
                            'package.json',
                            'src/main.ts',
                            'src/debug.ts',
                            'src/routes/+page.svelte',
                        ],
                    },
                ],
            })
            await sleep(700)
            threadService.update(threadID, {
                type: 'append-agent-steps',
                steps: [
                    {
                        id: newThreadStepID(),
                        type: 'agent-message',
                        content: 'I will check if tests are already passing.',
                    },
                ],
            })
            await sleep(250)
            threadService.update(threadID, {
                type: 'append-agent-steps',
                steps: [
                    {
                        id: newThreadStepID(),
                        type: 'terminal-command',
                        cwd: '~/src/github.com/stellora/airline',
                        command: 'pnpm run test',
                        userChoice: 'pending',
                    },
                ],
            })
        }
    })
}

async function sleep(msec: number) {
    return new Promise(resolve => setTimeout(resolve, msec))
}
