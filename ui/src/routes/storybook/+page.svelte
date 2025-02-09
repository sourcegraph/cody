<script lang="ts">
	import Transcript from '$lib/components/thread'
	import {
		default as TranscriptThinkAction,
		default as TranscriptThinkingRow,
	} from '$lib/components/thread/steps/think-step.svelte'
	import type { ThreadUpdateCallback } from '$lib/types'
	import {
		type BuiltinTools,
		newThreadStepID,
		type ThreadStepID,
		type ToolInvocation,
	} from '@sourcegraph/cody-shared'
	import Story from './story.svelte'

	function stepID(): ThreadStepID {
		return newThreadStepID()
	}

	let readFilesStepID = stepID()
	let createFileStepID = stepID()
	let runHelloWorldStepID = stepID()
	let runHelloWorldAgainStepID = stepID()

	let readExistingTestFilesStepID = stepID()
	let definitionStepID = stepID()
	let referencesStepID = stepID()
	let editFileStepID = stepID()
	let runTestStepID = stepID()

	let fakeUpdateThread: ThreadUpdateCallback = (update) => {
		alert('Called updateThread')
	}
</script>

<Story title="Thinking" component={TranscriptThinkingRow}>
	<TranscriptThinkAction step={{ id: stepID(), pending: true }} />
	<TranscriptThinkAction
		step={{
			id: stepID(),
			content: 'If the user said TypeScript, they probably mean JavaScript is OK as well.',
			pending: true,
		}}
	/>
</Story>

<Story title="Transcript thinking" component={Transcript}>
	<Transcript
		thread={{
			steps: [
				{
					id: stepID(),
					type: 'human-message',
					content: 'Write a TypeScript "Hello, world" program.',
				},
				{ id: stepID(), type: 'think', pending: true },
			],
		}}
	/>
</Story>

<Story title="Transcript - in progress" component={Transcript}>
	<Transcript
		thread={{
			steps: [
				{
					id: readFilesStepID,
					type: 'tool',
					tool: 'read-files',
					args: { files: ['foo.go', 'bar.go', 'baz.go', 'src/view/qux.ts'] },
				},
			],
			toolInvocations: {
				[readFilesStepID]: {
					args: {
						files: ['foo.go', 'bar.go', 'baz.go', 'src/view/qux.ts'],
					},
					meta: undefined,
					invocation: {
						status: 'in-progress',
						progress: undefined,
					},
				} satisfies ToolInvocation<BuiltinTools['read-files']>,
			},
		}}
	/>
</Story>

<Story title="Transcript - Hello world" component={Transcript}>
	<Transcript
		thread={{
			steps: [
				{
					id: stepID(),
					type: 'human-message',
					content: 'Write a TypeScript "Hello, world" program.',
				},
				{
					id: stepID(),
					type: 'think',
					content:
						'If the user said TypeScript, they probably mean JavaScript is OK as well. When they say program, they want something that prints out that "Hello, world" string. Because they did not give much detail, they probably want the simplest program that works.',
				},
				{
					id: stepID(),
					type: 'human-message',
					content:
						'Let me first check if there are any existing files in the workspace that might help.',
				},
				{
					id: readFilesStepID,
					type: 'tool',
					tool: 'read-files',
					args: { files: ['foo.go', 'bar.go', 'baz.go', 'src/view/qux.ts'] },
				},
				{
					id: stepID(),
					type: 'human-message',
					content: 'Here is a TypeScript "Hello, world" program:',
				},
				{
					id: createFileStepID,
					type: 'tool',
					tool: 'create-file',
					args: {
						file: 'src/hello-world.ts',
						content: 'console.log("Hello, world!")',
					},
				},
				{
					id: stepID(),
					type: 'human-message',
					content: 'Let me run it to see if it works:',
				},
				{
					id: runHelloWorldStepID,
					type: 'tool',
					tool: 'terminal-command',
					args: {
						cwd: '~/src/my-project',
						command: 'node --experimental-strip-types src/hello-world.ts',
					},
				},
				{
					id: stepID(),
					type: 'human-message',
					content:
						'Great! It works. You can now run it yourself with the following command:',
				},
				{
					id: runHelloWorldAgainStepID,
					type: 'tool',
					tool: 'terminal-command',
					args: {
						cwd: '~/src/my-project',
						command: 'node --experimental-strip-types src/hello-world.ts',
					},
				},
			],
			toolInvocations: {
				[readFilesStepID]: {
					args: {
						files: ['foo.go', 'bar.go', 'baz.go', 'src/view/qux.ts'],
					},
					meta: undefined,
					invocation: {
						status: 'done',
						progress: undefined,
						result: {
							'foo.go': 'package myproject',
							'bar.go': 'package myproject',
							'baz.go': 'package myproject',
							'src/view/qux.ts': 'export function foo(): number { return 7 }',
						},
					},
				} satisfies ToolInvocation<BuiltinTools['read-files']>,
				[createFileStepID]: {
					args: {
						file: 'src/hello-world.ts',
						content: 'console.log("Hello, world!")',
					},
					meta: undefined,
					invocation: {
						status: 'done',
						progress: undefined,
						result: undefined,
					},
				} satisfies ToolInvocation<BuiltinTools['create-file']>,
				[runHelloWorldStepID]: {
					args: {
						cwd: '~/src/my-project',
						command: 'node --experimental-strip-types src/hello-world.ts',
					},
					userInput: { accepted: true },
					meta: undefined,
					invocation: {
						status: 'done',
						progress: { output: 'Hello, world!' },
						result: {
							output: 'Hello, world!',
							exitCode: 0,
						},
					},
				} satisfies ToolInvocation<BuiltinTools['terminal-command']>,
				[runHelloWorldAgainStepID]: {
					args: {
						cwd: '~/src/my-project',
						command: 'node --experimental-strip-types src/hello-world.ts',
					},
					userInput: undefined, // not yet approved
					meta: undefined,
					invocation: {
						status: 'done',
						progress: { output: 'Hello, world!' },
						result: {
							output: 'Hello, world!',
							exitCode: 0,
						},
					},
				} satisfies ToolInvocation<BuiltinTools['terminal-command']>,
			},
			userInput: {
				[runHelloWorldStepID]: { accepted: true },
			},
		}}
		updateThread={fakeUpdateThread}
	/>
</Story>

<Story title="Transcript - Generate test" component={Transcript}>
	<Transcript
		thread={{
			steps: [
				{
					id: stepID(),
					type: 'human-message',
					content: 'Generate unit tests for ParseFlightNumber.',
				},
				{
					id: stepID(),
					type: 'agent-message',
					content:
						'Let me read the definition of ParseFlightNumber, see how it is being called, and see what tests already exist for it or similar functions.',
				},
				{
					id: definitionStepID,
					type: 'tool',
					tool: 'definition',
					args: {
						symbol: 'ParseFlightNumber',
					},
				},
				{
					id: stepID(),
					type: 'agent-message',
					content: 'Let me see how ParseFlightNumber is being called.',
				},
				{
					id: referencesStepID,
					type: 'tool',
					tool: 'references',
					args: {
						symbol: 'ParseFlightNumber',
					},
				},
				{
					id: stepID(),
					type: 'agent-message',
					content: 'Let me see what tests already exist for ParseFlightNumber.',
				},
				{
					id: readExistingTestFilesStepID,
					type: 'tool',
					tool: 'read-files',
					args: {
						files: [
							'flight_number_test.go',
							'flights_test.go',
							'airlines_test.go',
							'util_test.go',
						],
					},
				},
				{
					id: stepID(),
					type: 'agent-message',
					content: 'OK, I will consider all the cases we need to test.',
				},
				{
					id: stepID(),
					type: 'think',
					content:
						'OK, we need to check for when it is valid, when it is invalid, and when it is empty. Airline codes appear to be 2-letter IATA codes, and I do not see any cases where a 3-letter ICAO code is used. If so, it would introduce ambiguity because IATA and ICAO codes can contain numbers, and we would not know when the airline code ended and the flight number began.',
				},
				{
					id: stepID(),
					type: 'agent-message',
					content: 'Here are the unit tests for ParseFlightNumber:',
				},
				{
					id: editFileStepID,
					type: 'tool',
					tool: 'edit-file',
					args: {
						file: 'flight_number_test.go',
						diff: '@@ 123,456\n+ func TestParseFlightNumber(t *testing.T) {\n  ctx := context.Background()\n',
					},
				},
				{
					id: stepID(),
					type: 'agent-message',
					content: 'Let me run it to see if it works:',
				},
				{
					id: runTestStepID,
					type: 'tool',
					tool: 'terminal-command',
					args: {
						cwd: '~/src/github.com/evanw/esbuild',
						command: 'go test -run=TestParseFlightNumber',
					},
				},
				{
					id: stepID(),
					type: 'agent-message',
					content: 'Great! The new unit test passes.',
				},
				{
					id: stepID(),
					type: 'agent-turn-done',
				},
			],
			toolInvocations: {
				[readExistingTestFilesStepID]: {
					args: {
						files: [
							'flight_number_test.go',
							'flights_test.go',
							'airlines_test.go',
							'util_test.go',
						],
					},
					meta: undefined,
					invocation: {
						status: 'done',
						progress: undefined,
						result: {
							'flight_number_test.go': 'package airline',
							'flights_test.go': 'package airline',
							'airlines_test.go': 'package airline',
							'util_test.go': 'package airline',
						},
					},
				} satisfies ToolInvocation<BuiltinTools['read-files']>,
				[definitionStepID]: {
					args: {
						symbol: 'ParseFlightNumber',
					},
					meta: undefined,
					invocation: {
						status: 'done',
						progress: undefined,
						result: {
							content:
								'func ParseFlightNumber(flightNumber string) (airline, number string, err error) {\n\tif len(flightNumber) < 3 {\n\t\treturn "", "", errors.New("flight number too short")\n\t}\n\n\tairline = flightNumber[:2]\n\tnumber = flightNumber[2:]\n\n\treturn airline, number, nil\n}',
						},
					},
				} satisfies ToolInvocation<BuiltinTools['definition']>,
				[referencesStepID]: {
					args: {
						symbol: 'ParseFlightNumber',
					},
					meta: undefined,
					invocation: {
						status: 'done',
						progress: undefined,
						result: {
							references: [
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
					},
				} satisfies ToolInvocation<BuiltinTools['references']>,
				[editFileStepID]: {
					args: {
						file: 'flight_number_test.go',
						diff: '@@ 123,456 @@\n+ func TestParseFlightNumber(t *testing.T) {\n  ctx := context.Background()\n',
					},
					meta: {
						diffStat: {
							added: 51,
							changed: 3,
							deleted: 0,
						},
					},
					invocation: {
						status: 'done',
						progress: { 'flight_number_test.go': true },
						result: undefined,
					},
				} satisfies ToolInvocation<BuiltinTools['edit-file']>,
				[runTestStepID]: {
					args: {
						cwd: '~/src/github.com/evanw/esbuild',
						command: 'go test -run=TestParseFlightNumber',
					},
					meta: undefined,
					invocation: {
						status: 'done',
						progress: { output: 'ok      github.com/foo/airline    0.005s' },
						result: {
							output: 'ok      github.com/foo/airline    0.005s',
							exitCode: 0,
						},
					},
				} satisfies ToolInvocation<BuiltinTools['terminal-command']>,
			},
			userInput: {
				[runTestStepID]: { accepted: true },
			},
		}}
		updateThread={fakeUpdateThread}
	/>
</Story>
