<script lang="ts">
	import { cn } from '$lib/utils'
	import { getWebviewAPIContext } from '$lib/webview-api/context.js'

	let { class: className }: { class?: string } = $props()

	const webviewAPI = getWebviewAPIContext()

	// TODO!(sqs)
	let authStatus = webviewAPI.authStatus()
</script>

<footer
	class={cn(
		'relative w-full border-t border-foreground/15 bg-foreground/15 py-1 px-1.5 text-xxs max-h-[100px] overflow-auto',
		className,
	)}
>
	<pre>{JSON.stringify($authStatus, null, 2)}</pre>
</footer>
