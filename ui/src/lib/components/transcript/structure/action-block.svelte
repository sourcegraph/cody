<script lang="ts">
	import { cn } from '$lib/utils.js'
	import type { Snippet } from 'svelte'

	let {
		children,
		width = 'full',
		border = true,
		class: className,
	}: {
		children: Snippet
		width?: 'fit' | 'full'
		border?: boolean
		class?: string
	} = $props()
</script>

<div
	class={cn(
		'py-1 text-sm text-foreground/90',
		width === 'full' ? 'flex' : 'inline-flex',
		border ? 'border rounded-xs px-1.5' : '',
		className,
	)}
>
	{@render children()}
</div>
