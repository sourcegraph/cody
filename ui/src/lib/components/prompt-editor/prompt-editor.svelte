<script lang="ts">
	import { cn } from '$lib/utils.js'
	import type { HTMLAttributes } from 'svelte/elements'

	let {
		ref = $bindable(null),
		value = $bindable(undefined),
		compact,
		onsubmit,
		...restProps
	}: {
		ref?: HTMLElement | null
		value?: string
		compact?: boolean
		onsubmit?: (value: string) => void
	} & Omit<HTMLAttributes<HTMLTextAreaElement>, 'onsubmit'> = $props()
</script>

<textarea
	bind:this={ref}
	class={cn(
		'w-full rounded-sm border border-border/40 py-1 px-2 bg-input/30 focus:outline-none focus:border-border resize-none',
		{
			'h-[60px]': !compact,
		},
	)}
	rows={1}
	onkeydown={(e) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault()
			onsubmit?.(e.currentTarget?.value ?? '')
		}
	}}
	bind:value
	{...restProps}
></textarea>
