import fs from "fs";
import path from "path";
import * as vscode from "vscode";
import {
	type TextChange,
	updateRangeMultipleChanges,
} from "../../src/non-stop/tracked-range";

const EMOJI_SVG_TEMPLATE = `<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="24px">{emoji}</text>
</svg>`;

type TUTORIAL_STATES = "Intro" | "Todo" | "Done";
const TUTORIAL_EMOJIS: Record<TUTORIAL_STATES, string> = {
	Intro: "&#128075;",
	Todo: "&#128073;",
	Done: "&#x2705;",
};
const transformEmojiToSvg = (emoji: string) => {
	const svg = EMOJI_SVG_TEMPLATE.replace("{emoji}", emoji);
	const uri =
		"data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
	return vscode.Uri.parse(uri);
};

const INTRO_DECORATION = vscode.window.createTextEditorDecorationType({
	gutterIconPath: transformEmojiToSvg(TUTORIAL_EMOJIS.Intro),
	gutterIconSize: "contain",
});
const TODO_DECORATION = vscode.window.createTextEditorDecorationType({
	gutterIconPath: transformEmojiToSvg(TUTORIAL_EMOJIS.Todo),
	gutterIconSize: "contain",
});
const COMPLETE_DECORATION = vscode.window.createTextEditorDecorationType({
	gutterIconPath: transformEmojiToSvg(TUTORIAL_EMOJIS.Done),
	gutterIconSize: "contain",
});

const openTutorial = async (uri: vscode.Uri): Promise<vscode.TextEditor> => {
	if (process.platform !== "darwin") {
		// Update shortcuts for non-Darwin platforms
		let content = fs.readFileSync(uri.fsPath, "utf8");
		content = content.replace("Opt", "Alt").replace("Cmd", "Ctrl");
		fs.writeFileSync(uri.fsPath, content);
	}

	return vscode.window.showTextDocument(uri);
};

export const getInteractiveRanges = (document: vscode.TextDocument) => {
	const interactiveLines = document.getText().split("\n");

	const autocompleteLine =
		interactiveLines.findIndex((line) =>
			line.includes("^ Place cursor above"),
		) - 1;
	let autocompleteRange = new vscode.Range(
		new vscode.Position(autocompleteLine, 0),
		new vscode.Position(autocompleteLine, Number.MAX_SAFE_INTEGER),
	);
	const editLine =
		interactiveLines.findIndex((line) =>
			line.includes("^ Place cursor above and press"),
		) - 1;
	let editRange = new vscode.Range(
		new vscode.Position(editLine, 0),
		new vscode.Position(editLine, Number.MAX_SAFE_INTEGER),
	);

	const fixLine =
		interactiveLines.findIndex((line) =>
			line.includes("^ Place cursor here and press"),
		) - 1;
	// The fix range already has characters, so limit this to the actual text in the line
	let fixRange = new vscode.Range(
		new vscode.Position(
			fixLine,
			document.lineAt(fixLine).firstNonWhitespaceCharacterIndex,
		),
		new vscode.Position(fixLine, Number.MAX_SAFE_INTEGER),
	);

	return {
		Autocomplete: {
			range: autocompleteRange,
			originalText: document.getText(autocompleteRange).trim(),
		},
		Edit: {
			range: editRange,
			originalText: document.getText(editRange).trim(),
		},
		Fix: {
			range: fixRange,
			originalText: document.getText(fixRange).trim(),
		},
	};
};

export const registerInteractiveTutorial = (
	context: vscode.ExtensionContext,
): {
	disposables: vscode.Disposable[];
	start: () => Promise<void>;
} => {
	const disposables: vscode.Disposable[] = [];
	const tutorialPath = path.join(
		context.extensionUri.fsPath,
		"walkthroughs",
		"cody_tutorial.py",
	);
	const documentUri = vscode.Uri.file(tutorialPath);
	let hasStarted = false;

	const start = async () => {
		hasStarted = true;
		const editor = await openTutorial(documentUri);
		let introductionRange = new vscode.Range(0, 0, 0, 0);
		const interactiveRanges = getInteractiveRanges(editor.document);

		// Set gutter decorations for associated lines, note: VS Code automatically keeps track of these lines
		// so we don't need to update these
		editor.setDecorations(INTRO_DECORATION, [new vscode.Range(0, 0, 0, 0)]);
		editor.setDecorations(
			TODO_DECORATION,
			Object.values(interactiveRanges).map(
				({ range }) => new vscode.Range(range.start, range.start),
			),
		);

		const diagnosticCollection =
			vscode.languages.createDiagnosticCollection("codyTutorial");
		const setDiagnostic = () => {
			// Attach diagnostics to the fix line. This is so that, if the user doesn't already have
			// a Python language server installed, they will still see the "Ask Cody to Fix" option.
			diagnosticCollection.set(documentUri, [
				{
					range: interactiveRanges.Fix.range,
					message: "Implicit string concatenation not allowed",
					severity: vscode.DiagnosticSeverity.Error,
				},
			]);
		};
		setDiagnostic();

		/**
		 * Listen for changes in the tutorial text document, and update the
		 * interactive line ranges depending on those changes.
		 * This ensures that, even if the user modifies the document,
		 * we can accurately track where we want them to interact.
		 */
		const listenForInteractiveLineRangeUpdates =
			vscode.workspace.onDidChangeTextDocument((event) => {
				if (event.document.uri !== editor.document.uri) {
					return;
				}

				const changes = new Array<TextChange>(...event.contentChanges);
				const newIntroRange = updateRangeMultipleChanges(
					introductionRange,
					changes,
					{
						supportRangeAffix: true,
					},
				);
				if (!newIntroRange.isEqual(introductionRange)) {
					introductionRange = newIntroRange;
				}

				for (const interactiveRange of Object.values(interactiveRanges)) {
					const newInteractiveRange = updateRangeMultipleChanges(
						interactiveRange.range,
						changes,
						{
							supportRangeAffix: true,
						},
					);
					if (!newInteractiveRange.isEqual(interactiveRange.range)) {
						interactiveRange.range = newInteractiveRange;
					}
				}
			});

		/**
		 * Listen for cursor updates in the tutorial text document,
		 * so we can automatically trigger a completion when the user
		 * clicks on the intended line.
		 * This is intended as a shortcut to typical completions without
		 * requiring the user to actually start typing.
		 */
		const listenForAutocomplete = vscode.window.onDidChangeTextEditorSelection(
			async ({ textEditor }) => {
				const document = textEditor.document;
				if (document.uri !== editor.document.uri) {
					return;
				}

				if (!textEditor.selection.isEmpty) {
					return;
				}

				const interactiveRange = interactiveRanges.Autocomplete;
				if (
					interactiveRange.range.contains(textEditor.selection.active) &&
					document.getText(interactiveRange.range).trim() ===
						interactiveRange.originalText
				) {
					// Cursor is on the intended autocomplete line, and we don't already have any content
					// Manually trigger an autocomplete for the ease of the tutorial
					await vscode.commands.executeCommand(
						"cody.autocomplete.manual-trigger",
					);
				}
			},
		);

		/**
		 * Listen to __any__ changes in the interactive text document, so we can
		 * check to see if the user has made any progress on the tutorial tasks.
		 *
		 * If the user has modified any of the interactive lines, then we mark
		 * that line as complete.
		 */
		const listenForSuccess = vscode.workspace.onDidChangeTextDocument(
			async ({ document }) => {
				if (document.uri !== editor.document.uri) {
					return;
				}

				// We don't actually care about the changes here, we just want to inspect our tracked
				// lines to see if they are still empty. If they are not, they we can report success
				const completeRanges = [];
				const todoRanges = [];
				for (const [key, interactiveRange] of Object.entries(
					interactiveRanges,
				)) {
					const activeText = document.getText(interactiveRange.range).trim();
					if (
						activeText.length > 0 &&
						activeText !== interactiveRange.originalText
					) {
						completeRanges.push(
							new vscode.Range(
								interactiveRange.range.start,
								interactiveRange.range.start,
							),
						);

						if (key === "Fix") {
							// Additionally reset the diagnostics
							diagnosticCollection.clear();
						}
					} else {
						todoRanges.push(
							new vscode.Range(
								interactiveRange.range.start,
								interactiveRange.range.start,
							),
						);

						if (key === "Fix") {
							// Re-apply the diagnostic
							setDiagnostic();
						}
					}
				}
				editor.setDecorations(TODO_DECORATION, todoRanges);
				editor.setDecorations(COMPLETE_DECORATION, completeRanges);
			},
		);

		disposables.push(
			listenForInteractiveLineRangeUpdates,
			listenForAutocomplete,
			listenForSuccess,
			vscode.workspace.onDidCloseTextDocument((document) => {
				if (document.uri !== editor.document.uri) {
					return;
				}

				// Clean up when document is closed
				for (const disposable of disposables) {
					disposable.dispose();
				}
			}),
		);
	};

	const visibleTutorial = vscode.window.visibleTextEditors.filter((editor) => {
		return editor.document.uri.fsPath === documentUri.fsPath;
	});
	if (visibleTutorial && !hasStarted) {
		start();
	}

	disposables.push(
		vscode.window.onDidChangeActiveTextEditor((event) => {
			if (
				!event ||
				event.document.uri.fsPath !== documentUri.fsPath ||
				hasStarted
			) {
				return;
			}

			// User has manually activated the tutorial document, ensure it has started
			start();
		}),
		vscode.commands.registerCommand("cody.tutorial.start", start),
	);

	return {
		disposables,
		start,
	};
};
