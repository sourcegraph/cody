/**
 * List of all supported languages that we have grammars and
 * lexems for. Note that enum values are copied from VSCode API,
 * if we want to make it work with different editors we should
 * enhance language detection.
 *
 * TODO: Decouple language detect to make it editor agnostic
 */
export enum SupportedLanguage {
    'objective-c' = 'objective-c',
    c = 'c',
    cpp = 'cpp',
    csharp = 'csharp',
    css = 'css',
    dart = 'dart',
    elixir = 'elixir',
    elm = 'elm',
    go = 'go',
    html = 'html',
    java = 'java',
    javascript = 'javascript',
    javascriptreact = 'javascriptreact',
    json = 'json',
    kotlin = 'kotlin',
    elisp = 'elisp',
    lua = 'lua',
    ocaml = 'ocaml',
    php = 'php',
    python = 'python',
    rescript = 'rescript',
    ruby = 'ruby',
    rust = 'rust',
    scala = 'scala',
    shellscript = 'bash',
    swift = 'swift',
    typescript = 'typescript',
    typescriptreact = 'typescriptreact',
}

export const DOCUMENT_LANGUAGE_TO_GRAMMAR: Record<SupportedLanguage, string> = {
    [SupportedLanguage['objective-c']]: 'tree-sitter-objc.wasm',
    [SupportedLanguage.c]: 'tree-sitter-c.wasm',
    [SupportedLanguage.cpp]: 'tree-sitter-cpp.wasm',
    [SupportedLanguage.csharp]: 'tree-sitter-c_sharp.wasm',
    [SupportedLanguage.css]: 'tree-sitter-css.wasm',
    [SupportedLanguage.dart]: 'tree-sitter-dart.wasm',
    [SupportedLanguage.elisp]: 'tree-sitter-elisp.wasm',
    [SupportedLanguage.elixir]: 'tree-sitter-elixir.wasm',
    [SupportedLanguage.elm]: 'tree-sitter-elm.wasm',
    [SupportedLanguage.go]: 'tree-sitter-go.wasm',
    [SupportedLanguage.html]: 'tree-sitter-html.wasm',
    [SupportedLanguage.java]: 'tree-sitter-java.wasm',
    [SupportedLanguage.javascript]: 'tree-sitter-javascript.wasm',
    [SupportedLanguage.javascriptreact]: 'tree-sitter-javascript.wasm',
    [SupportedLanguage.json]: 'tree-sitter-json.wasm',
    [SupportedLanguage.kotlin]: 'tree-sitter-kotlin.wasm',
    [SupportedLanguage.lua]: 'tree-sitter-lua.wasm',
    [SupportedLanguage.ocaml]: 'tree-sitter-ocaml.wasm',
    [SupportedLanguage.php]: 'tree-sitter-php.wasm',
    [SupportedLanguage.python]: 'tree-sitter-python.wasm',
    [SupportedLanguage.rescript]: 'tree-sitter-rescript.wasm',
    [SupportedLanguage.ruby]: 'tree-sitter-ruby.wasm',
    [SupportedLanguage.rust]: 'tree-sitter-rust.wasm',
    [SupportedLanguage.scala]: 'tree-sitter-scala.wasm',
    [SupportedLanguage.shellscript]: 'tree-sitter-bash.wasm',
    [SupportedLanguage.swift]: 'tree-sitter-swift.wasm',
    [SupportedLanguage.typescript]: 'tree-sitter-typescript.wasm',
    [SupportedLanguage.typescriptreact]: 'tree-sitter-tsx.wasm',
} as const

export const isSupportedLanguage = (
    documentLanguageId: string
): documentLanguageId is SupportedLanguage => {
    return documentLanguageId in SupportedLanguage
}
