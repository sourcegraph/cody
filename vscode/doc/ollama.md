# Experimental autocomplete support with Ollama running locally

## How to use

1. Install and run [Ollama](https://ollama.ai/)
2. Put ollama in your $PATH. E.g. `ln -s ./ollama /usr/local/bin/ollama`.
3. Download Code Llama 7b: `ollama pull codellama:7b`
4. Update Cody's VS Code settings to use the `unstable-ollama` autocomplete provider.
5. Confirm Cody uses Ollama by looking at the Cody output channel or the autocomplete trace view (in the command palette).
