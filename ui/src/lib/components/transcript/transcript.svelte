<script lang="ts">
	import type { TranscriptMessage } from '$lib/types'
	import PromptEditor from '../prompt-editor/prompt-editor.svelte'
	import TranscriptThinkAction from './actions/think-action.svelte'

	let { messages }: { messages: TranscriptMessage[] } = $props()
</script>

<div class="space-y-4">
	{#each messages as message}
		{#if message.type === 'user'}
			<PromptEditor value={message.content} compact />
		{:else if message.type === 'agent'}
			{#each message.steps as step}
				{#if step.type === 'think'}
					<TranscriptThinkAction {step} />
				{:else}
					<p>{step.content}</p>
				{/if}
			{/each}
		{/if}
	{/each}
</div>
