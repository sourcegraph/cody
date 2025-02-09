<script lang="ts">
	import { page } from '$app/state'
	import InteractiveChat from '$lib/components/interactive-thread/interactive-thread.svelte'
	import {
		createAgentForInteractiveThread,
		isThreadID,
		type AgentState,
	} from '@sourcegraph/cody-shared'
	import { onMount } from 'svelte'

	let { data } = $props()

	let threadID = page.params.thread
	if (!isThreadID(threadID)) {
		throw new Error('invalid thread ID')
	}

	let agentState = $state<AgentState | null>(null)
	onMount(() => {
		const threadAgent = createAgentForInteractiveThread(data.threadService, threadID).subscribe(
			(nextAgentState) => {
				agentState = nextAgentState
			},
		)
		return () => {
			threadAgent.unsubscribe()
		}
	})
</script>

<InteractiveChat {threadID} thread={data.thread} threadService={data.threadService} {agentState} />
