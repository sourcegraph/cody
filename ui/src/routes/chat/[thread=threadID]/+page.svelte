<script lang="ts">
	import { page } from '$app/state'
	import InteractiveChat from '$lib/components/interactive-thread/interactive-thread.svelte'
	import { isThreadID } from '@sourcegraph/cody-shared'

	let { data } = $props()

	let threadID = page.params.thread
	if (!isThreadID(threadID)) {
		throw new Error('invalid thread ID')
	}
</script>

<InteractiveChat {threadID} thread={data.thread} />
