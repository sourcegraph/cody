<script lang="ts">
	import type { TranscriptAction } from '$lib/types'
	import ActionBlock from '../structure/action-block.svelte'

	let { step }: { step: Omit<Extract<TranscriptAction, { type: 'definition' }>, 'type'> } =
		$props()
</script>

<ActionBlock>
	<div>
		{#if step.pending}
			Analyzing definition of <span class="font-mono text-xxs text-muted-foreground"
				>{step.symbol}</span
			>
		{:else}
			Analyzed definition of
			<span class="text-muted-foreground font-mono text-xxs">
				{step.symbol}
			</span>
		{/if}
	</div>
</ActionBlock>
