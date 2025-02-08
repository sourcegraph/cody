<script lang="ts">
	import { cn } from '$lib/utils.js'
	import type { Snippet } from 'svelte'
	import type { HTMLAttributes } from 'svelte/elements'

	let {
		ref = $bindable(null),
		children,
		class: className,
		...restProps
	}: {
		ref?: HTMLElement | null
		children: Snippet
	} & HTMLAttributes<HTMLElement> = $props()
</script>

<nav bind:this={ref} class={cn('flex gap-6 items-center px-2 py-1', className)} {...restProps}>
	{@render children()}
</nav>
