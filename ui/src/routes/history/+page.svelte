<script lang="ts">
	import { route } from '$lib/route-helpers.js'
	import type { ObservableValue } from '@sourcegraph/cody-shared'

	let { data } = $props()
	let threads_ = data.threadHistory
	let threads = $derived($threads_ as ObservableValue<typeof data.threadHistory> | undefined)
</script>

{#if threads && threads.length > 0}
	<ul class="border rounded-xs [&>li]:border-b">
		{#each threads as thread (thread.id)}
			{@const firstStep = thread.steps.at(0)}
			<li>
				<a
					href={route('/chat/[thread=threadID]', { params: { thread: thread.id } })}
					class="py-1 px-2 hover:bg-accent flex items-center"
				>
					<span
						>{#if firstStep?.type === 'human-message'}
							{firstStep.content}
						{:else}
							Untitled thread
						{/if}
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
	<p>No threads yet</p>
{/if}
