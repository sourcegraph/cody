<script lang="ts">
	import type { TranscriptMessage } from '../../types'

	let { message }: { message: TranscriptMessage } = $props()
</script>

<ul class="flex flex-wrap gap-2 text-xs">
	{#if message.think}
		<li class="text-muted-foreground">Reasoning</li>
	{/if}
</ul>
