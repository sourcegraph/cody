<script lang="ts">
	import type { ThreadStep } from '$lib/types'
	import CollapsibleActionBlock from '../structure/collapsible-action-block.svelte'

	let { step }: { step: Omit<Extract<ThreadStep, { type: 'think' }>, 'type'> } = $props()
</script>

<CollapsibleActionBlock disabled={!step.content}>
	{#snippet summary()}
		{#if step.pending}
			<span
				class="animate-shimmer bg-gradient-to-r text-foreground/50 from-transparent via-foreground to-transparent bg-clip-text bg-[length:35%_150%] bg-no-repeat"
			>
				Thinking...
			</span>
		{:else}
			Thought
		{/if}
	{/snippet}

	{step.content ?? '...'}
</CollapsibleActionBlock>
