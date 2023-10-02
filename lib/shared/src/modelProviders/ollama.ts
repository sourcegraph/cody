export interface OllamaOptions {
    /**
     * URL to the Ollama server.
     *
     * @example http://localhost:11434
     */
    url: string

    /**
     * The Ollama model to use. Currently only codellama and derived models are supported.
     *
     * @example codellama:7b-code
     */
    model: string

    /**
     * Parameters for how Ollama will run the model. See Ollama PARAMETER documentation.
     */
    parameters?: OllamaGenerateParameters
}

/**
 * @see https://sourcegraph.com/github.com/jmorganca/ollama/-/blob/docs/modelfile.md#valid-parameters-and-values
 * @see https://sourcegraph.com/github.com/jmorganca/ollama/-/blob/api/types.go?L143
 */
export interface OllamaGenerateParameters {
    seed?: number
    num_ctx?: number
    temperature?: number
    stop?: string[]
    top_k?: number
    top_p?: number
    penalize_newline?: boolean
    num_thread?: number
    num_predict?: number
}
