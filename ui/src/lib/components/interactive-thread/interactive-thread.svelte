<script lang="ts">
	import PromptEditor from '$lib/components/prompt-editor/prompt-editor.svelte'
	import Thread from '$lib/components/thread/thread.svelte'
	import type { ThreadID, ThreadUpdate } from '$lib/types'
	import {
		firstValueFrom,
		type AgentState,
		type InteractiveThread,
	} from '@sourcegraph/cody-shared'
	import { Observable } from 'observable-fns'
	import { getWebviewAPIContext } from '../../webview-api/context'

	let {
		threadID,
		thread: threadObservable,
	}: {
		threadID: ThreadID
		thread: Observable<InteractiveThread>
	} = $props()

	let thread = $derived<InteractiveThread | undefined>(
		$threadObservable as InteractiveThread | undefined,
	)

	let webviewAPI = getWebviewAPIContext()

	// Start agent.
	let agentState = $state<AgentState>()
	$effect(() => {
		const subscription = webviewAPI.startAgentForThread(threadID).subscribe((v) => {
			agentState = v
		})
		return () => {
			subscription.unsubscribe()
			agentState = undefined
		}
	})

	async function handleSubmit(value: string): Promise<void> {
		await firstValueFrom(
			webviewAPI.updateThread(threadID, {
				type: 'append-human-message',
				content: value,
			}),
		)
	}

	async function updateThread(update: ThreadUpdate): Promise<void> {
		await firstValueFrom(webviewAPI.updateThread(threadID, update))
	}

	let showDebug = false
	let showState = true
</script>

{#if thread}
	<div class="flex flex-col gap-4">
		{#if showDebug}
			<pre
				class="overflow-auto h-[150px] bg-input/30 text-xxs p-2 rounded-xs flex-shrink-0">{JSON.stringify(
					thread,
					null,
					2,
				)}</pre>
		{/if}
		{#if showState}
			<span class="text-xxs rounded-lg px-2 py-1 bg-muted text-muted-foreground self-start">
				<em>debug</em> Agent: {agentState ?? 'not running'}
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
