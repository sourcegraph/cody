<script lang="ts">
	import { page } from '$app/state'
	import InteractiveChat from '$lib/components/interactive-thread/interactive-thread.svelte'
	import { type ThreadID } from '@sourcegraph/cody-shared'

	let { data } = $props()
</script>

<InteractiveChat threadID={page.params.thread as ThreadID} thread={data.thread} />
