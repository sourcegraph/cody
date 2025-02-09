<script lang="ts">
	import File from '@lucide/svelte/icons/file'
	import type { BuiltinTools } from '@sourcegraph/cody-shared'
	import type { ToolCallStepProps } from '../steps/tool-call-step.svelte'
	import CollapsibleActionBlock from '../structure/collapsible-action-block.svelte'

	let { step, toolInvocation }: ToolCallStepProps<BuiltinTools['read-files']> = $props()
</script>

<CollapsibleActionBlock expandable={toolInvocation.invocation.status === 'done'}>
	{#snippet summary()}
		{#if toolInvocation.invocation.status !== 'done'}
			Reading files...
		{:else}
			Read
			<span class="text-muted-foreground">
				{#if toolInvocation.args.files.length === 1}
					{toolInvocation.args.files[0]}
				{:else}
					{toolInvocation.args.files.length} files
				{/if}
			</span>
		{/if}
	{/snippet}

	{#if toolInvocation.invocation.status === 'done'}
		<ol class="pl-2 ml-1 border-l border-foreground/30 flex flex-col gap-0.5">
			{#each toolInvocation.args.files as file}
				<li
					class="[&>svg]:size-2.5 [&>svg]:text-muted-foreground inline-flex items-center gap-1 text-xs"
				>
					<File />
					{file}
				</li>
			{/each}
		</ol>
	{/if}
</CollapsibleActionBlock>
