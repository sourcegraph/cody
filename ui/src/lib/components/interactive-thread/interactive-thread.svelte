<script lang="ts">
	import PromptEditor from '$lib/components/prompt-editor/prompt-editor.svelte'
	import Thread from '$lib/components/thread/thread.svelte'
	import type { ThreadID, ThreadUpdate } from '$lib/types'
	import {
		type AgentState,
		type InteractiveThread,
		type InteractiveThreadService,
	} from '@sourcegraph/cody-shared'
	import { Observable } from 'observable-fns'

	let {
		threadID,
		thread: threadObservable,
		threadService,
		agentState,
	}: {
		threadID: ThreadID
		thread: Observable<InteractiveThread>
		threadService: InteractiveThreadService
		agentState: AgentState
	} = $props()

	let thread = $derived<InteractiveThread | undefined>(
		$threadObservable as InteractiveThread | undefined,
	)

	async function handleSubmit(value: string): Promise<void> {
		threadService.update(threadID, { type: 'append-human-message', content: value })
	}

	function updateThread(update: ThreadUpdate): void {
		threadService.update(threadID, update)
	}

	let showDebug = false
</script>

{#if thread}
	<div class="flex flex-col gap-4">
		{#if showDebug}
			<pre
				class="overflow-auto max-h-[200px] bg-input/30 text-xxs p-2 rounded-xs">{JSON.stringify(
					thread,
					null,
					2,
				)}</pre>
			<span class="text-xxs rounded-lg px-2 py-1 bg-muted text-muted-foreground self-start">
				Agent: {agentState ?? 'not running'}
			</span>
		{/if}
		{#if thread.steps.length === 0}
			<PromptEditor onsubmit={handleSubmit} />
		{/if}
		<Thread {thread} {updateThread} />
		{#if thread.steps.length >= 1}
			<footer class="mt-auto">
				<PromptEditor onsubmit={handleSubmit} />
			</footer>
		{/if}
	</div>
{/if}
