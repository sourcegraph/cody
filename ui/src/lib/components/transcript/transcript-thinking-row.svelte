<script lang="ts">
	let { think }: { think: string } = $props()
</script>

<span
	class="animate-shimmer bg-gradient-to-r text-foreground/50 from-transparent via-foreground to-transparent bg-clip-text bg-[length:35%_150%] bg-no-repeat"
>
	{think}
</span>
