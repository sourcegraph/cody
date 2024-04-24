# Experimental autocomplete support with Ollama running locally

## How to use

1. Install and run [Ollama](https://ollama.ai/)
1. Download one of the support local models:

- `ollama pull deepseek-coder:6.7b-base-q4_K_M` for [deepseek-coder](https://ollama.ai/library/deepseek-coder)
- `ollama pull codellama:7b-code` for [codellama](https://ollama.ai/library/codellama)
- `ollama pull codegemma:2b` for [codegemma](https://ollama.ai/library/codegemma)

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

# Experimental chat and commands support with Ollama running locally

## How to use

1. Download Ollama https://ollama.com/download
2. Start Ollama (makes sure the ollama logo is showing up in your menu bar)
3. Select a chat model (model that includes instruct or chat, e.g. [gemma:7b-instruct-q4_K_M](https://ollama.com/library/gemma:7b-instruct-q4_K_M)) from the [Ollama Library](https://ollama.com/library)
4. Pull the chat model locally (e.g. `ollama pull gemma:7b-instruct-q4_K_M`)
5. Once the chat model is downloaded successfully, open Cody in VS Code
6. Open a new Cody chat
7. In the new chat panel, you should see the chat model you've pulled in the dropdown list
8. Currently, you will need to restart VS Code to see the new models

Note: You can run `ollama list` in your terminal to see what Ollama models are currently available on your machine
