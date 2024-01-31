# Experimental autocomplete support with Ollama running locally

## How to use

1. Install and run [Ollama](https://ollama.ai/)
2. Download one of the support local models:
  - `ollama pull deepseek-coder:6.7b-base-q4_K_M` for [deepseek-coder](https://ollama.ai/library/deepseek-coder)
  - `ollama pull codellama:7b-code` for [codellama](https://ollama.ai/library/codellama)
3. Update Cody's VS Code settings to use the `unstable-ollama` autocomplete provider.
4. Confirm Cody uses Ollama by looking at the Cody output channel or the autocomplete trace view (in the command palette).
