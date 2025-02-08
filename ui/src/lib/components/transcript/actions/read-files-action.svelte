<script lang="ts">
	import type { TranscriptAction } from '$lib/types'
	import File from '@lucide/svelte/icons/file'
	import CollapsibleActionBlock from '../structure/collapsible-action-block.svelte'

	let { step }: { step: Omit<Extract<TranscriptAction, { type: 'read-files' }>, 'type'> } =
		$props()
</script>

<CollapsibleActionBlock expandable={!step.pending}>
	{#snippet summary()}
		{#if step.pending}
			Reading files...
		{:else}
			Read
			<span class="text-muted-foreground">
				{#if step.files.length === 1}
					foo.go
				{:else}
					{step.files.length} files
				{/if}
			</span>
		{/if}
	{/snippet}

	{#if !step.pending}
		<ol class="pl-2 ml-1 border-l border-foreground/30 flex flex-col gap-0.5">
			{#each step.files as file}
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
