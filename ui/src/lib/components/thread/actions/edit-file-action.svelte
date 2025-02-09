<script lang="ts">
	import DiffStat from '$lib/components/diff-stat.svelte'
	import type { ThreadStep } from '$lib/types'
	import CollapsibleActionBlock from '../structure/collapsible-action-block.svelte'

	let { step }: { step: Omit<Extract<ThreadStep, { type: 'edit-file' }>, 'type'> } =
		$props()
</script>

<CollapsibleActionBlock expandable={!step.pending}>
	{#snippet summary()}
		{#if step.pending}
			<span>Editing <span class="text-muted-foreground">{step.file}</span></span>
		{:else}
			<span class="mr-0.5">
				Edited
				<span class="text-muted-foreground">
					{step.file}
				</span>
			</span>
			<DiffStat {...step.diffStat} />
		{/if}
	{/snippet}

	<pre class="text-xxs mt-2 mb-1">{step.diff}</pre>
</CollapsibleActionBlock>
