<script lang="ts">
	import PromptEditor from '$lib/components/prompt-editor/prompt-editor.svelte'
	import Transcript from '$lib/components/transcript/transcript.svelte'
	import type { TranscriptMessage } from '$lib/types'

	let messages = $state<TranscriptMessage[]>([])

	async function handleSubmit(value: string): Promise<void> {
		messages = [...messages, { type: 'user', content: value }]

		// Simulate assistant response with thinking
		const assistantMessage: TranscriptMessage = {
			type: 'assistant',
			think: 'Let me think about this...',
			content: '',
		}
		messages = [...messages, assistantMessage]

		// Simulate thinking time
		await new Promise((resolve) => setTimeout(resolve, 1000))

		// Update with final response
		messages = messages.map((m, i) =>
			i === messages.length - 1
				? { ...m, think: undefined, content: 'Here is my response to your message.' }
				: m,
		)
	}
</script>

<div class="flex flex-col gap-4">
	{#if messages.length === 0}
		<PromptEditor onsubmit={handleSubmit} />
	{/if}
	<Transcript {messages} />
	{#if messages.length >= 1}
		<footer class="mt-auto">
			<PromptEditor onsubmit={handleSubmit} />
		</footer>
	{/if}
</div>
