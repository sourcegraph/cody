<script lang="ts">
	import DiffStat from '$lib/components/diff-stat.svelte'
	import type { BuiltinTools } from '@sourcegraph/cody-shared'
	import type { ToolCallStepProps } from '../steps/tool-call-step.svelte'
	import CollapsibleActionBlock from '../structure/collapsible-action-block.svelte'

	let { step, toolInvocation }: ToolCallStepProps<BuiltinTools['edit-file']> = $props()
</script>

<CollapsibleActionBlock expandable={toolInvocation.invocation.status === 'done'}>
	{#snippet summary()}
		{#if toolInvocation.invocation.status !== 'done'}
			<span>
				Editing
				<span class="text-muted-foreground">{toolInvocation.args.file}</span>
			</span>
		{:else}
			<span class="mr-0.5">
				Edited
				<span class="text-muted-foreground">
					{toolInvocation.args.file}
				</span>
			</span>
			<DiffStat {...toolInvocation.argsMeta.diffStat} />
		{/if}
	{/snippet}

	{#if toolInvocation.invocation.status === 'done'}
		<pre class="text-xxs mt-1.5">{toolInvocation.invocation.status}</pre>
	{/if}
</CollapsibleActionBlock>
