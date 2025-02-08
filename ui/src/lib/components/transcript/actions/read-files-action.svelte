<script lang="ts">
	import type { TranscriptAction } from '$lib/types'
	import CollapsibleActionBlock from '../structure/collapsible-action-block.svelte'

	let { step }: { step: Omit<Extract<TranscriptAction, { type: 'read-files' }>, 'type'> } =
		$props()
</script>

<CollapsibleActionBlock expandable={!step.pending}>
	{#snippet summary()}
		{#if step.pending}
			Reading files...
		{:else}
			Analyzed <span class="text-muted-foreground">foo.go</span>
		{/if}
	{/snippet}

	{#if !step.pending}
		{step.files.join(', ')}
	{/if}
</CollapsibleActionBlock>
