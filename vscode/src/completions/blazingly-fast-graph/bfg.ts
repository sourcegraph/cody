import fs from "fs"
import git from "isomorphic-git"
import { join } from 'path'
import { Uri } from 'vscode'

interface InitializeParams {}

interface Position {
    line: number
    character: number
}

interface Range {
    start: Position
    end: Position
}

interface Location {
    uri: string
    range: Range
}

interface Excerpt {
    languageId: string
    code: string
}

export class BlazinglyFastGraph {
    async initialize(params: InitializeParams): Promise<void> {}
    async shutdown(params: void): Promise<void> {}
    
    excerpts(params: Location): Promise<Excerpt[]> {
        throw new Error('Method not implemented.')
    }

    private async recurseThroughTree(gitdir: string, parent: string, oid: string): Promise<void> {
        const result = await git.readTree({
            fs,
            gitdir,
            oid,
            dir: parent,
        });

        for (const entry of result.tree) {
            if (entry.type === "tree") {
                console.log(`${parent}/${entry.path}`);
                this.recurseThroughTree(gitdir, `${parent}/${entry.path}`, entry.oid);
            } else {
                // console.log(`${parent}/${entry.path}`);
            }
        }
    }

    async didRevisionChange(repoUri: string): Promise<void> {
        const gitdir = Uri.parse(repoUri).fsPath;

        const oid = await git.resolveRef({
            fs,
            gitdir,
            ref: "HEAD",
        });

        await this.recurseThroughTree(gitdir, join(gitdir, ".."), oid);
    }
}
