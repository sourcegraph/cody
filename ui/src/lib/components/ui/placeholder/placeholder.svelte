<script lang="ts">
	import { cn } from '$lib/utils.js'

	let { text, class: className }: { text: string; class?: string } = $props()
</script>

<div
	class={cn(
		'inline-flex items-center justify-center rounded-md border border-border/40 bg-input/30 px-3 text-xl font-extrabold text-foreground/15 w-full h-full relative overflow-hidden',
		className,
	)}
>
	<div
		class="absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(0,0,0,0.2)_10px,rgba(0,0,0,0.2)_20px)]"
	></div>
	<span class="relative">{text}</span>
</div>
