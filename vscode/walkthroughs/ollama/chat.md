## Chat & Commands with Ollama in Cody

Experimental chat and commands support with Ollama running locally.

1. Install and run [Ollama](https://ollama.com/download).
2. Select a chat model (model that includes `instruct` or `chat`, e.g. [codegemma:instruct](https://ollama.com/library/codegemma:instruct), [llama3:instruct](https://ollama.com/library/llama3:instruct)) from the [Ollama Library](https://ollama.com/library).
3. Pull the chat model locally (Example: `ollama pull codegemma:instruct`).
4. Once the chat model is downloaded successfully, open Cody in VS Code.
5. Open a new Cody chat.
6. In the new chat panel, you should see the chat model you've pulled in the dropdown list at the top

Note: You can run `ollama list` in your terminal to see what Ollama models are currently available on your machine.

Learn more about [Local chat with Ollama and Cody](https://sourcegraph.com/blog/local-chat-with-ollama-and-cody).
