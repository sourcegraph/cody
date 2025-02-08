<script lang="ts">
	import type { TranscriptAction } from '$lib/types'
	import ActionBlock from '../structure/action-block.svelte'
	import CollapsibleActionBlock from '../structure/collapsible-action-block.svelte'

	let { step }: { step: Omit<Extract<TranscriptAction, { type: 'think' }>, 'type'> } = $props()
</script>

{#if step.pending}
	<ActionBlock>
		<span
			class="animate-shimmer bg-gradient-to-r text-foreground/50 from-transparent via-foreground to-transparent bg-clip-text bg-[length:35%_150%] bg-no-repeat"
		>
			Thinking...
		</span>
	</ActionBlock>
{:else}
	<CollapsibleActionBlock>
		{#snippet summary()}
			Thought
		{/snippet}
		{step.content}
	</CollapsibleActionBlock>
{/if}
