<script>
	import Transcript from '$lib/components/thread'
	import {
		default as TranscriptThinkAction,
		default as TranscriptThinkingRow,
	} from '$lib/components/thread/actions/think-action.svelte'
	import Story from './story.svelte'
</script>

<Story title="Thinking" component={TranscriptThinkingRow}>
	<TranscriptThinkAction step={{ pending: true }} />
	<TranscriptThinkAction
		step={{
			content: 'If the user said TypeScript, they probably mean JavaScript is OK as well.',
			pending: true,
		}}
	/>
</Story>

<Story title="Transcript thinking" component={Transcript}>
	<Transcript
		thread={{
			steps: [
				{ type: 'human-message', content: 'Write a TypeScript "Hello, world" program.' },
				{ type: 'think', pending: true },
			],
		}}
	/>
</Story>

<Story title="Transcript - Hello world" component={Transcript}>
	<Transcript
		thread={{
			steps: [
				{ type: 'human-message', content: 'Write a TypeScript "Hello, world" program.' },
				{
					type: 'think',
					content:
						'If the user said TypeScript, they probably mean JavaScript is OK as well. When they say program, they want something that prints out that "Hello, world" string. Because they did not give much detail, they probably want the simplest program that works.',
				},
				{
					type: 'human-message',
					content:
						'Let me first check if there are any existing files in the workspace that might help.',
				},
				{
					type: 'read-files',
					files: ['foo.go', 'bar.go', 'baz.go', 'src/view/qux.ts'],
				},
				{
					type: 'human-message',
					content: 'Here is a TypeScript "Hello, world" program:',
				},
				{
					type: 'create-file',
					file: 'src/hello-world.ts',
					content: 'console.log("Hello, world!")',
				},
				{
					type: 'human-message',
					content: 'Let me run it to see if it works:',
				},
				{
					type: 'terminal-command',
					cwd: '~/src/github.com/evanw/esbuild',
					command: 'node --experimental-strip-types src/hello-world.ts',
					output: 'Hello, world!',
				},
				{
					type: 'human-message',
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
		}}
	/>
</Story>

<Story title="Transcript - Generate test" component={Transcript}>
	<Transcript
		thread={{
			steps: [
				{ type: 'human-message', content: 'Generate unit tests for ParseFlightNumber.' },
				{
					type: 'human-message',
					content:
						'Let me read the definition of ParseFlightNumber, see how it is being called, and see what tests already exist for it or similar functions.',
				},
				{
					type: 'definition',
					symbol: 'ParseFlightNumber',
				},
				{
					type: 'human-message',
					content: 'Let me see how ParseFlightNumber is being called.',
				},
				{
					type: 'references',
					symbol: 'ParseFlightNumber',
					results: [
						'airline, number, err := airline.ParseFlightNumber("AA123")',
						'if _, _, err := airline.ParseFlightNumber("DL456"); err != nil {',
						'airline, _, err := ParseFlightNumber(flightNumber)',
						'_, num, _ = airline.ParseFlightNumber(input)',
					],
					repositories: [
						'github.com/foo/bar',
						'github.com/baz/qux',
						'github.com/bat/quux',
					],
				},
				{
					type: 'human-message',
					content: 'Let me see what tests already exist for ParseFlightNumber.',
				},
				{
					type: 'read-files',
					files: [
						'flight_number_test.go',
						'flights_test.go',
						'airlines_test.go',
						'util_test.go',
					],
				},
				{
					type: 'human-message',
					content: 'OK, I will consider all the cases we need to test.',
				},
				{
					type: 'think',
					content:
						'OK, we need to check for when it is valid, when it is invalid, and when it is empty. Airline codes appear to be 2-letter IATA codes, and I do not see any cases where a 3-letter ICAO code is used. If so, it would introduce ambiguity because IATA and ICAO codes can contain numbers, and we would not know when the airline code ended and the flight number began.',
				},
				{
					type: 'human-message',
					content: 'Here are the unit tests for ParseFlightNumber:',
				},
				{
					type: 'edit-file',
					file: 'flight_number_test.go',
					diff: '@@ 123,456\n+ func TestParseFlightNumber(t *testing.T) {\n  ctx := context.Background()\n',
					diffStat: {
						added: 51,
						changed: 3,
						deleted: 0,
					},
				},
				{
					type: 'human-message',
					content: 'Let me run it to see if it works:',
				},
				{
					type: 'terminal-command',
					cwd: '~/src/github.com/evanw/esbuild',
					command: 'go test -run=TestParseFlightNumber',
					output: 'ok      github.com/foo/airline    0.005s',
				},
				{
					type: 'human-message',
					content: 'Great! The new unit test passes.',
				},
			],
		}}
	/>
</Story>
