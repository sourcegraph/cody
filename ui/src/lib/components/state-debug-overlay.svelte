<script lang="ts">
	import { getWebviewAPIContext } from '$lib/webview-api/context.js'
	import { onMount } from 'svelte'

	const webviewAPI = getWebviewAPIContext()

	// TODO!(sqs)
	let x = webviewAPI.authStatus()
	onMount(() => {
		// x.subscribe((v) => console.log('AUTHSTATUS', v))
	})
</script>

<footer class="relative w-full border-t border-foreground/20 bg-foreground/20 py-1 px-1.5 text-xs">
	foo: {$x}
</footer>
