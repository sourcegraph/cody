<script lang="ts">
	import { page } from '$app/state'
	import InteractiveChat from '$lib/components/interactive-thread/interactive-thread.svelte'
	import { createAgentForInteractiveThread } from '@sourcegraph/cody-shared'
	import { onMount } from 'svelte'

	let { data } = $props()

	onMount(() => {
		console.log('QQQ')
		const threadAgent = createAgentForInteractiveThread(data.threadService, page.params.thread)
		return () => {
			threadAgent.unsubscribe()
		}
	})
</script>

<InteractiveChat
	threadID={page.params.thread}
	thread={data.thread}
	threadService={data.threadService}
/>
