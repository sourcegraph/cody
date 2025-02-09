<script lang="ts">
	import { page } from '$app/state'
	import InteractiveChat from '$lib/components/interactive-chat/interactive-chat.svelte'

	let { data } = $props()
</script>

<InteractiveChat
	threadID={page.params.thread}
	thread={data.thread}
	threadService={data.threadService}
/>
