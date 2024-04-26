## Code Autocomplete with Ollama in Cody

Follow the steps below to set up experimental autocomplete support with Ollama running locally:

1. Install and run [Ollama](https://ollama.com/download).
2. Download one of the supported models:

- `ollama pull deepseek-coder:6.7b-base-q4_K_M` for [deepseek-coder](https://ollama.ai/library/deepseek-coder)
- `ollama pull codellama:7b-code` for [codellama](https://ollama.ai/library/codellama)
- `ollama pull codegemma:2b` for [codegemma](https://ollama.ai/library/codegemma)

3. Update Cody's VS Code settings to use the `experimental-ollama` autocomplete provider and configure the correct model:

```json
{
  "cody.autocomplete.advanced.provider": "experimental-ollama",
  "cody.autocomplete.experimental.ollamaOptions": {
    "url": "http://localhost:11434",
    "model": "deepseek-coder:6.7b-base-q4_K_M"
  }
}
```

4. Confirm that Cody is using Ollama by checking the Cody output channel or the autocomplete trace view (in the command palette).

Learn more about [Local code completion with Ollama and Cody](https://sourcegraph.com/blog/local-code-completion-with-ollama-and-cody).

## Chat & Commands with Ollama in Cody

Experience experimental chat and commands support with Ollama running locally:

1. Install and run [Ollama](https://ollama.com/download).
2. Select a chat model (model that includes `instruct` or `chat`, e.g. [codegemma:instruct](https://ollama.com/library/codegemma:instruct), [llama3:instruct](https://ollama.com/library/llama3:instruct)) from the [Ollama Library](https://ollama.com/library).
3. Pull the chat model locally (Example: `ollama pull codegemma:instruct`).
4. Once the chat model is downloaded successfully, open Cody in VS Code.
5. Open a new Cody chat.
6. In the new chat panel, you should see the chat model you've pulled in the dropdown list at the top

Note: You can run `ollama list` in your terminal to see what Ollama models are currently available on your machine.

Learn more about [Local chat with Ollama and Cody](https://sourcegraph.com/blog/local-chat-with-ollama-and-cody).

> NOTE: Non-Enterprise users only.
