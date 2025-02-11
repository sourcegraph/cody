<script lang="ts">
	import { route } from '$lib/route-helpers.js'
	import type { ObservableValue } from '@sourcegraph/cody-shared'

	let { data } = $props()
	let threads_ = data.threadHistory
	let threads = $derived($threads_ as ObservableValue<typeof data.threadHistory> | undefined)
</script>

<div class="border rounded-xs flex">
	{#if threads && threads.length > 0}
		<ul class="[&>li]:border-b w-full">
			{#each threads as thread (thread.id)}
				<li>
					<a
						href={route('/chat/[thread=threadID]', { params: { thread: thread.id } })}
						class="py-1 px-2 hover:bg-accent flex items-center"
					>
						<span>
							{thread.title ?? 'Untitled thread'}
						</span>
						<span class="text-muted-foreground text-xs ml-auto">
							{new Date(thread.created).toLocaleTimeString(undefined, {
								timeStyle: 'short',
								hour12: false,
							})}
						</span>
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="text-muted-foreground p-2 self-center text-center w-full">No chats yet</p>
	{/if}
</div>
