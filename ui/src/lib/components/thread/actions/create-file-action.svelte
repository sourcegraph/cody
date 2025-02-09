<script lang="ts">
	import type { ThreadStep } from '$lib/types'
	import DiffStat from '../../diff-stat.svelte'
	import CollapsibleActionBlock from '../structure/collapsible-action-block.svelte'

	let { step }: { step: Omit<Extract<ThreadStep, { type: 'create-file' }>, 'type'> } =
		$props()
</script>

<CollapsibleActionBlock expandable={!step.pending}>
	{#snippet summary()}
		{#if step.pending}
			<span>Creating <span class="text-muted-foreground">{step.file}</span></span>
		{:else}
			<span class="mr-0.5">
				Created
				<span class="text-muted-foreground">
					{step.file}
				</span>
			</span>
			<DiffStat added={step.content.split('\n').length} />
		{/if}
	{/snippet}

	<pre class="text-xxs mt-2 mb-1">{step.content}</pre>
</CollapsibleActionBlock>
