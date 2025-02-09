<script lang="ts">
	import PromptEditor from '$lib/components/prompt-editor/prompt-editor.svelte'
	import Transcript from '$lib/components/transcript/transcript.svelte'
	import { type InteractiveThread, type InteractiveThreadService } from '@sourcegraph/cody-shared'
	import { Observable } from 'observable-fns'

	let {
		threadID,
		thread: threadObservable,
		threadService,
	}: {
		threadID: string
		thread: Observable<InteractiveThread>
		threadService: InteractiveThreadService
	} = $props()

	let thread = $derived<InteractiveThread | undefined>(
		$threadObservable as InteractiveThread | undefined,
	)

	async function handleSubmit(value: string): Promise<void> {
		threadService.update(threadID, { type: 'append-human-message', content: value })
	}
</script>

{#if thread}
	<div class="flex flex-col gap-4">
		<pre
			class="overflow-auto max-h-[200px] bg-input/30 text-xxs p-2 rounded-xs">{JSON.stringify(
				thread,
				null,
				2,
			)}</pre>
		{#if thread.transcript.length === 0}
			<PromptEditor onsubmit={handleSubmit} />
		{/if}
		<Transcript messages={thread.transcript} />
		{#if thread.transcript.length >= 1}
			<footer class="mt-auto">
				<PromptEditor onsubmit={handleSubmit} />
			</footer>
		{/if}
	</div>
{/if}
