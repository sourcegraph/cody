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

### LLM Judge

[LLM judge tool](../e2e/README.md)
