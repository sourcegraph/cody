<script>
	import Transcript from '$lib/components/transcript'
	import {
		default as TranscriptThinkAction,
		default as TranscriptThinkingRow,
	} from '$lib/components/transcript/actions/think-action.svelte'
	import Story from './story.svelte'
</script>

<Story title="Thinking" component={TranscriptThinkingRow}>
	<TranscriptThinkAction step={{ content: 'Verifying...', pending: true }} />
	<TranscriptThinkAction
		step={{
			content: 'If the user said TypeScript, they probably mean JavaScript is OK as well.',
			pending: true,
		}}
	/>
</Story>

<Story title="Transcript thinking" component={Transcript}>
	<Transcript
		messages={[
			{ type: 'user', content: 'Write a TypeScript "Hello, world" program.' },
			{
				type: 'agent',
				steps: [{ type: 'think', pending: true }],
			},
		]}
	/>
</Story>

<Story title="Transcript response" component={Transcript}>
	<Transcript
		messages={[
			{ type: 'user', content: 'Write a TypeScript "Hello, world" program.' },
			{
				type: 'agent',
				steps: [
					{
						type: 'think',
						content:
							'If the user said TypeScript, they probably mean JavaScript is OK as well. When they say program, they want something that prints out that "Hello, world" string. Because they did not give much detail, they probably want the simplest program that works.',
					},
					{
						type: 'message',
						content:
							'Let me first check if there are any existing files in the workspace that might help.',
					},
					{
						type: 'read-files',
						files: ['foo.go', 'bar.go', 'baz.go', 'src/view/qux.ts'],
					},
					{
						type: 'message',
						content: 'Here is a TypeScript "Hello, world" program:',
					},
					{
						type: 'create-file',
						file: 'src/hello-world.ts',
						content: 'console.log("Hello, world!")',
					},
					{
						type: 'message',
						content: 'Let me run it to see if it works:',
					},
					{
						type: 'terminal-command',
						cwd: '~/src/github.com/evanw/esbuild',
						command: 'node --experimental-strip-types src/hello-world.ts',
						output: 'Hello, world!',
					},
					{
						type: 'message',
						content:
							'Great! It works. You can now run it yourself with the following command:',
					},
					{
						type: 'terminal-command',
						cwd: '~/src/github.com/evanw/esbuild',
						command: 'node --experimental-strip-types src/hello-world.ts',
						pendingUserApproval: true,
					},
				],
			},
		]}
	/>
</Story>
