/**
 * These are a set of invisible tags that are used to invisibly indicate
 * internal state without opening the extension. Primarily used for testing.
 * This is done because the text of the status bar is considered flaky as
 * depending on other state the displayed value might change.
 */
export enum InvisibleStatusBarTag {
    IsAuthenticated = '\u200B',
    HasErrors = '\u200C',
    HasLoaders = '\u200D',
    IsIgnored = '\u2060',
    // Unassigned = '\u2061'
    // Unassigned = '\u2062'
    // Unassigned = '\u2063'
    // Unassigned = '\u2064'
}
