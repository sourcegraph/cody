<script lang="ts">
	import type { TranscriptMessage } from '$lib/types'
	import PromptEditor from '../prompt-editor/prompt-editor.svelte'

	let { messages }: { messages: TranscriptMessage[] } = $props()
</script>

<div class="flex flex-col gap-4">
	{#each messages as message}
		{#if message.type === 'user'}
			<PromptEditor value={message.content} compact />
		{:else if message.type === 'assistant'}
			{#if message.think}
				<div class="text-sm text-foreground/70">Thinking: {message.think}</div>
			{:else}
				{message.content}
			{/if}
		{/if}
	{/each}
</div>
