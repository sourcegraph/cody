<script lang="ts">
	import { Button } from '$lib/components/ui/button'
	import type { BuiltinTools } from '@sourcegraph/cody-shared'
	import type { ToolCallStepProps } from '../steps/tool-call-step.svelte'
	import ActionBlock from '../structure/action-block.svelte'
	import CollapsibleActionBlock from '../structure/collapsible-action-block.svelte'

	let {
		step,
		toolInvocation,
		userInput,
		updateThread,
	}: ToolCallStepProps<BuiltinTools['terminal-command']> = $props()
</script>

{#if !userInput}
	<ActionBlock class="flex-col gap-2">
		<h2>Suggested terminal command</h2>
		<div class="space-y-1">
			{#if toolInvocation.args.cwd}
				<div class="font-mono text-xxs text-muted-foreground">
					{toolInvocation.args.cwd}
				</div>
			{/if}
			<pre
				class="bg-muted/50 rounded-xs text-xs border border-border/75 p-2 before:content-['$_'] before:text-muted-foreground"><code
					>{toolInvocation.args.command}</code
				></pre>
		</div>
		{#if updateThread}
			<div class="space-x-1 mb-1">
				<Button
					variant="default"
					size="sm"
					onclick={() =>
						updateThread({
							step: step.id,
							type: 'user-input',
							value: { accepted: true },
						})}
				>
					Run
				</Button>
				<Button
					variant="secondary"
					size="sm"
					onclick={() =>
						updateThread({
							step: step.id,
							type: 'user-input',
							value: { accepted: false },
						})}
				>
					Reject
				</Button>
			</div>
		{/if}
	</ActionBlock>
{:else}
	<CollapsibleActionBlock>
		{#snippet summary()}
			<span>
				{#if toolInvocation.invocation.status === 'done'}
					Executed
				{:else}
					Executing
				{/if}
				<span class="text-muted-foreground font-mono text-xxs">
					{toolInvocation.args.command}
				</span>
			</span>
		{/snippet}

		{#if toolInvocation.invocation.status === 'done'}
			<pre class="text-xxs mt-1.5">{toolInvocation.invocation.result.output}</pre>
		{/if}
	</CollapsibleActionBlock>
{/if}
