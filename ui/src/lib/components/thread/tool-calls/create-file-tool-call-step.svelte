<script lang="ts">
	import type { BuiltinTools } from '@sourcegraph/cody-shared'
	import DiffStat from '../../diff-stat.svelte'
	import type { ToolCallStepProps } from '../steps/tool-call-step.svelte'
	import CollapsibleActionBlock from '../structure/collapsible-action-block.svelte'

	let { step, toolInvocation }: ToolCallStepProps<BuiltinTools['create-file']> = $props()
</script>

<CollapsibleActionBlock expandable={toolInvocation.invocation.status === 'done'}>
	{#snippet summary()}
		{#if toolInvocation.invocation.status !== 'done'}
			<span>
				Creating
				<span class="text-muted-foreground">{toolInvocation.args.file}</span>
			</span>
		{:else}
			<span class="mr-0.5">
				Created
				<span class="text-muted-foreground">
					{toolInvocation.args.file}
				</span>
			</span>
			<DiffStat added={toolInvocation.args.content.split('\n').length} />
		{/if}
	{/snippet}

	{#if toolInvocation.args.content}
		<pre class="text-xxs mt-1.5">{toolInvocation.args.content}</pre>
	{/if}
</CollapsibleActionBlock>
