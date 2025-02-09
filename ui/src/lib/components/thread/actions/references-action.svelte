<script lang="ts">
	import type { ThreadStep } from '$lib/types'
	import CollapsibleActionBlock from '../structure/collapsible-action-block.svelte'

	let { step }: { step: Omit<Extract<ThreadStep, { type: 'references' }>, 'type'> } =
		$props()
</script>

<CollapsibleActionBlock
	expandable={!step.pending}
	disabled={step.pending || !step.results || step.results.length === 0}
>
	{#snippet summary()}
		{#if step.pending}
			<span
				>Analyzing references to <span class="font-mono text-xxs text-muted-foreground"
					>{step.symbol}</span
				></span
			>
		{:else}
			<span
				>Analyzed {step.results ? step.results.length : ''} references to
				<span class="text-muted-foreground font-mono text-xxs">
					{step.symbol}
				</span>
				{#if step.repositories}
					from {step.repositories.length} repositories
				{/if}</span
			>
		{/if}
	{/snippet}

	{#if step.results && step.results.length > 0}
		<ul class="flex flex-col gap-1 mt-1 mb-0.5">
			{#each step.results ?? [] as result}
				<li>
					<pre
						class="bg-muted/50 rounded-xs text-xxs border border-border/75 px-2 py-1"><code
							>{result}</code
						></pre>
				</li>
			{/each}
		</ul>
	{/if}
</CollapsibleActionBlock>
