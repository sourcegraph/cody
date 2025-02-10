<script lang="ts">
	import { route } from '$lib/route-helpers.js'
	import type { ObservableValue } from '@sourcegraph/cody-shared'

	let { data } = $props()
	let threadIDs_ = data.historyThreadIDs
	let threadIDs = $derived(
		$threadIDs_ as ObservableValue<typeof data.historyThreadIDs> | undefined,
	)
</script>

{#if threadIDs && threadIDs.length > 0}
	<ul>
		{#each threadIDs as threadID}
			<li>
				<a href={route('/chat/[thread=threadID]', { params: { thread: threadID } })}>
					{threadID}
				</a>
			</li>
		{/each}
	</ul>
{:else}
	<p>No threads yet</p>
{/if}
