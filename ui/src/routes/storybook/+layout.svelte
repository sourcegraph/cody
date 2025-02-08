<script lang="ts">
	import type { Snippet } from 'svelte'

	let { children }: { children: Snippet } = $props()
</script>

<main class="border-t py-2 space-y-4">
	{@render children()}
</main>
