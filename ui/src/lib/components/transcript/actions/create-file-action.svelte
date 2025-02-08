<script lang="ts">
	import type { TranscriptAction } from '$lib/types'
	import CollapsibleActionBlock from '../structure/collapsible-action-block.svelte'

	let { step }: { step: Omit<Extract<TranscriptAction, { type: 'create-file' }>, 'type'> } =
		$props()
</script>

<CollapsibleActionBlock expandable={!step.pending}>
	{#snippet summary()}
		{#if step.pending}
			Creating {step.file}
		{:else}
			Created
			<span class="text-muted-foreground">
				{step.file}
			</span>
		{/if}
	{/snippet}

	<pre class="text-xxs mt-2 mb-1">{step.content}</pre>
</CollapsibleActionBlock>
