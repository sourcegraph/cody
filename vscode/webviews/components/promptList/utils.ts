import { CustomCommandType, type CodyCommand, type Prompt } from "@sourcegraph/cody-shared";
import type { PromptOrDeprecatedCommand } from "./PromptList";

export function createPromptOrDeprecatedCommandArray(prompts: Prompt[], commands: CodyCommand[]): PromptOrDeprecatedCommand[] {
    const result: PromptOrDeprecatedCommand[] = [];

    // Add prompts to the result array
    for (const prompt of prompts) {
        result.push({ type: 'prompt', value: prompt });
    }

    // Add commands to the result array
    for (const command of commands) {
        result.push({ type: 'command', value: command });
    }

    return result;
}

export function hasCustomCommands(commands: CodyCommand[]): boolean {
    return commands.some(
        command =>
            command.type === CustomCommandType.Workspace || command.type === CustomCommandType.User
    )
}

export function commandRowValue(row: PromptOrDeprecatedCommand): string {
    return row.type === 'prompt' ? `prompt-${row.value.id}` : `command - ${row.value.key} `
}
