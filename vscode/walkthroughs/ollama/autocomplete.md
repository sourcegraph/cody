## Code Autocomplete with Ollama in Cody

Experimental autocomplete support with Ollama running locally.

1. Install and run [Ollama](https://ollama.com/download).
2. Download one of the supported models:

- `ollama pull deepseek-coder:6.7b-base-q4_K_M` for [deepseek-coder](https://ollama.ai/library/deepseek-coder)
- `ollama pull codellama:7b-code` for [codellama](https://ollama.ai/library/codellama)
- `ollama pull codegemma:2b` for [codegemma](https://ollama.ai/library/codegemma)

3. Update Cody's VS Code settings to use the `experimental-ollama` autocomplete provider and configure the right model:

```json
{
  "cody.autocomplete.advanced.provider": "experimental-ollama",
  "cody.autocomplete.experimental.ollamaOptions": {
    "url": "http://localhost:11434",
    "model": "deepseek-coder:6.7b-base-q4_K_M"
  }
}
```

4. Confirm that Cody uses Ollama by looking at the Cody output channel or the autocomplete trace view (in the command palette).

Learn more about [Local code completion with Ollama and Cody](https://sourcegraph.com/blog/local-code-completion-with-ollama-and-cody).
