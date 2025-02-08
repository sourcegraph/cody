<script lang="ts">
	import type { Snippet } from 'svelte'

	let { title, children }: { title: string; children: Snippet } = $props()
</script>

<section>
	<h2 class="text-lg font-semibold mb-1">{title}</h2>
	<div class="border rounded-sm p-2">
		{@render children()}
	</div>
</section>
