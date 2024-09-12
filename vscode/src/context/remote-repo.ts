export interface Repo {
    name: string
    id: string
}

/**
 * Maps a codebase name to a repo ID on the Sourcegraph remote, or undefined if there is none.
 */
export interface CodebaseRepoIdMapper {
    repoForCodebase(codebase: string): Promise<Repo | undefined>
}
