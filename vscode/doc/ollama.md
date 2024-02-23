# Experimental autocomplete support with Ollama running locally

## How to use

1. Install and run [Ollama](https://ollama.ai/)
1. Download one of the support local models:
  - `ollama pull deepseek-coder:6.7b-base-q4_K_M` for [deepseek-coder](https://ollama.ai/library/deepseek-coder)
  - `ollama pull codellama:7b-code` for [codellama](https://ollama.ai/library/codellama)
1. Update Cody's VS Code settings to use the `experimental-ollama` autocomplete provider and configure the right model:

   ```json
   {
     "cody.autocomplete.advanced.provider": "experimental-ollama",
     "cody.autocomplete.experimental.ollamaOptions": {
       "url": "http://localhost:11434",
       "model": "deepseek-coder:6.7b-base-q4_K_M"
     }
   }
   ```
1. Confirm Cody uses Ollama by looking at the Cody output channel or the autocomplete trace view (in the command palette).

## Current limitations

Ollama is currently only supported by the autocomplete feature and is considered experimental. You can track [issue #3252](https://github.com/sourcegraph/cody/issues/3252) for chat support.
