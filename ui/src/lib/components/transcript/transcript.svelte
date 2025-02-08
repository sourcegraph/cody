<script lang="ts">
	import type { TranscriptMessage } from '$lib/types'
	import PromptEditor from '../prompt-editor/prompt-editor.svelte'
	import TranscriptThinkingRow from './transcript-thinking-row.svelte'

	let { messages }: { messages: TranscriptMessage[] } = $props()
</script>

<div class="space-y-4">
	{#each messages as message}
		{#if message.type === 'user'}
			<PromptEditor value={message.content} compact />
		{:else if message.type === 'assistant'}
			{#if message.think && message.content === undefined}
				<TranscriptThinkingRow think={message.think} />
			{:else}
				{message.content}
			{/if}
		{/if}
	{/each}
</div>
