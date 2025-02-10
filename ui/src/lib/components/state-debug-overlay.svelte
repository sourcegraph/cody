<script lang="ts">
	import { getWebviewAPIContext } from '$lib/webview-api/context.js'

	const webviewAPI = getWebviewAPIContext()

	// TODO!(sqs)
	let authStatus = webviewAPI.authStatus()
</script>

<footer
	class="relative w-full border-t border-foreground/20 bg-foreground/20 py-1 px-1.5 text-xxs max-h-[100px] overflow-auto"
>
	<pre>{JSON.stringify($authStatus, null, 2)}</pre>
</footer>
