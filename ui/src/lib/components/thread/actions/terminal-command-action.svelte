<script lang="ts">
	import { Button } from '$lib/components/ui/button'
	import type { ThreadStep, ThreadUpdateCallback } from '$lib/types'
	import ActionBlock from '../structure/action-block.svelte'
	import CollapsibleActionBlock from '../structure/collapsible-action-block.svelte'

	let {
		step,
		updateThread,
	}: {
		step: Omit<Extract<ThreadStep, { type: 'terminal-command' }>, 'type'>
		updateThread?: ThreadUpdateCallback<'terminal-command:user-choice'>
	} = $props()
</script>

{#if step.userChoice === 'waiting'}
	<ActionBlock class="flex-col gap-2">
		<h2>Suggested terminal command</h2>
		<div class="space-y-1">
			{#if step.cwd}
				<div class="font-mono text-xxs text-muted-foreground">
					{step.cwd}
				</div>
			{/if}
			<pre
				class="bg-muted/50 rounded-xs text-xs border border-border/75 p-2 before:content-['$_'] before:text-muted-foreground"><code
					>{step.command}</code
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
							type: 'terminal-command:user-choice',
							choice: 'run',
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
							type: 'terminal-command:user-choice',
							choice: 'ignore',
						})}
				>
					Ignore
				</Button>
			</div>
		{/if}
	</ActionBlock>
{:else}
	<CollapsibleActionBlock>
		{#snippet summary()}
			<span>
				Executed
				<span class="text-muted-foreground font-mono text-xxs">
					{step.command}
				</span>
			</span>
		{/snippet}

		<pre class="text-xxs mt-2 mb-1">{step.output}</pre>
	</CollapsibleActionBlock>
{/if}
