# Cody quality tools

This section documents the tools we have to assess the quality of Cody in different scenarios.

As Cody is a BYOLLM product (Bring-your-own-LLM), when we introduce/use a new LLM (for example, a customer's own LLM model that they developed/trained themselves) we have a need to be able to quantify how well Cody is working with it.

## Autocompletion

### Influencing autocomplete performance

Cody autocompletion (code completions in your editor) can be powered by two types of models:

1. Chat-based models, where we "tell" the LLM it supposed to perform code completion in plain English, give it a code snippet, and extract the response code snippet from its (otherwise English) response.
2. An actual code-based model, these are LLMs that are trained to produce code only and can't produce English responses, they speak only code.

For chat-based models, we can influence the performance by altering the prompting AND context. For code-based models, we can typically influence the performance by adjusting the amount and relevancy of context only, as there is no prompting to adjust.

## Chat

### Influencing chat performance

The VS Code extension has _Cody commands_, which are pre-formed prompts you can ask Cody with e.g. the click of a button. There is also an initial pre-text given to the LLM, explaining what Cody is and how it should behave.

Relevant context from many different sources (the open file in your editor, tree-sitter, precise code intel, and more) is included in the prompt when asking Cody a question. Different LLMs handle context in different ways, some LLMs might do better with more context, while that might simply confuse others.

We can influence chat performance by altering prompting AND context amount/relevancy.

## Testing a new LLM with Cody

This guide demonstrates how to test LLM models from Google Gemini, Groq, or any OpenAI-compatible APIs using your API keys in Cody.

This feature is intended solely for internal QA testing and development purposes and is concealed behind an unregistered configuration setting (`cody.dev.models`) that functions exclusively in [Dev/Debug mode](../../../vscode/CONTRIBUTING.md).

### cody.dev.models

- provider: string
  - The name of the LLM provider. E.g., "google" for Google, "groq" for Groq, "openaicompatible" for an OpenAI-compatible API, etc.
- model: string
  - The ID of the model. E.g., "gemini-1.5-pro-latest"
- tokens?: number
  - The Context Window of the model. Default to 7k.
- apiKey?: string
  - The API Key for the API Endpoint if the endpoint required one.
- apiEndpoint?: string
  - The endpoint URL for the API that's different than the default URL.

## Getting Started

First, obtain an API key from the provider you wish to test Cody with:

- Google Gemini: https://makersuite.google.com/app/apikey
- Groq: https://console.groq.com/keys

Configure the dev models to use in your VS Code user settings:

```json
{
  "cody.dev.models": [
    // Google Gemini 1.5 Pro
    {
      "provider": "google",
      "model": "gemini-1.5-pro-latest",
      "tokens": 1000000,
      "apiKey": "$GEMINI_API_KEY"
    },
    // Groq llama2 70b
    {
      "provider": "groq",
      "model": "llama2-70b-4096",
      "tokens": 4096,
      "apiKey": "$GROQ_API_KEY"
    },
    // OpenAI / OpenAI-compatible APIs
    {
      "provider": "groq", // keep groq as provider
      "model": "$OPENAI_MODEL_NAME",
      "apiKey": "$OPENAI_API_KEY",
      "apiEndpoint": "$OPENAI_API_ENDPOINT"
    },
    // Ollama
    {
      "provider": "ollama",
      "model": "$OLLAMA_MODEL_NAME",
      "apiEndpoint": "$OLLAMA_API_ENDPOINT"
    }
  ]
}
```

You should now find the new models available in your chat panel. (You may need to reload VS Code fro the changes to take effect.)
