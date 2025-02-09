<script lang="ts">
	import type { BuiltinTools } from '@sourcegraph/cody-shared'
	import type { ToolCallStepProps } from '../steps/tool-call-step.svelte'
	import CollapsibleActionBlock from '../structure/collapsible-action-block.svelte'

	let { step, toolInvocation }: ToolCallStepProps<BuiltinTools['references']> = $props()
</script>

<CollapsibleActionBlock expandable={toolInvocation.invocation.status === 'done'}>
	{#snippet summary()}
		{#if toolInvocation.invocation.status !== 'done'}
			<span
				>Analyzing references to <span class="font-mono text-xxs text-muted-foreground"
					>{toolInvocation.args.symbol}</span
				></span
			>
		{:else}
			<span>
				Analyzed {toolInvocation.invocation.result.references.length} references to
				<span class="text-muted-foreground font-mono text-xxs">
					{toolInvocation.args.symbol}
				</span>
				{#if toolInvocation.invocation.result.repositories}
					from {toolInvocation.invocation.result.repositories.length} repositories
				{/if}
			</span>
		{/if}
	{/snippet}

	{#if toolInvocation.invocation.status === 'done' && toolInvocation.invocation.result.references.length > 0}
		<ul class="flex flex-col gap-1 mt-1.5">
			{#each toolInvocation.invocation.result.references as result}
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
