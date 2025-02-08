<script lang="ts">
	import type { TranscriptAction } from '$lib/types'
	import CollapsibleActionBlock from '../structure/collapsible-action-block.svelte'

	let { step }: { step: Omit<Extract<TranscriptAction, { type: 'references' }>, 'type'> } =
		$props()
</script>

<CollapsibleActionBlock expandable={!step.pending}>
	{#snippet summary()}
		{#if step.pending}
			Analyzing references to <span class="font-mono text-xxs text-muted-foreground"
				>{step.symbol}</span
			>
		{:else}
			Analyzed {step.results ? step.results.length : ''} references to
			<span class="text-muted-foreground font-mono text-xxs">
				{step.symbol}
			</span>
		{/if}
	{/snippet}

	<pre class="text-xxs mt-2 mb-1">{step.content}</pre>
</CollapsibleActionBlock>
