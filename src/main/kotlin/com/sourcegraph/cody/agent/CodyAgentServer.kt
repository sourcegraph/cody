package com.sourcegraph.cody.agent

import com.sourcegraph.cody.agent.protocol.*
import java.util.concurrent.CompletableFuture
import org.eclipse.lsp4j.jsonrpc.services.JsonNotification
import org.eclipse.lsp4j.jsonrpc.services.JsonRequest

/**
 * Interface for the server-part of the Cody agent protocol. The implementation of this interface is
 * written in TypeScript in the file "cody/agent/src/agent.ts". The Eclipse LSP4J bindings create a
 * Java implementation of this interface by using a JVM-reflection feature called "Proxy", which
 * works similar to JavaScript Proxy.
 */
interface CodyAgentServer {
  // Requests
  @JsonRequest("initialize") fun initialize(clientInfo: ClientInfo): CompletableFuture<ServerInfo>

  @JsonRequest("shutdown") fun shutdown(): CompletableFuture<Void?>

  @JsonRequest("recipes/list") fun recipesList(): CompletableFuture<List<RecipeInfo>>

  @JsonRequest("recipes/execute")
  fun recipesExecute(params: ExecuteRecipeParams?): CompletableFuture<Void?>

  @JsonRequest("autocomplete/execute")
  fun autocompleteExecute(params: AutocompleteParams?): CompletableFuture<AutocompleteResult>

  @JsonRequest("graphql/logEvent") fun logEvent(event: Event): CompletableFuture<Void?>

  @JsonRequest("graphql/currentUserId") fun currentUserId(): CompletableFuture<String>

  @JsonRequest("graphql/getRepoIdIfEmbeddingExists")
  fun getRepoIdIfEmbeddingExists(repoName: GetRepoIDResponse): CompletableFuture<String?>

  @JsonRequest("graphql/getRepoId")
  fun getRepoId(repoName: GetRepoIDResponse): CompletableFuture<String?>

  @JsonRequest("git/codebaseName")
  fun convertGitCloneURLToCodebaseName(cloneURL: CloneURL): CompletableFuture<String?>

  @JsonRequest("featureFlags/getFeatureFlag")
  fun evaluateFeatureFlag(flagName: GetFeatureFlag): CompletableFuture<Boolean?>

  @JsonRequest("graphql/currentUserIsPro") fun isCurrentUserPro(): CompletableFuture<Boolean?>

  // Notifications
  @JsonNotification("initialized") fun initialized()

  @JsonNotification("exit") fun exit()

  @JsonNotification("transcript/reset") fun transcriptReset()

  @JsonNotification("extensionConfiguration/didChange")
  fun configurationDidChange(document: ExtensionConfiguration)

  @JsonNotification("textDocument/didFocus") fun textDocumentDidFocus(document: TextDocument)

  @JsonNotification("textDocument/didOpen") fun textDocumentDidOpen(document: TextDocument)

  @JsonNotification("textDocument/didChange") fun textDocumentDidChange(document: TextDocument)

  @JsonNotification("textDocument/didClose") fun textDocumentDidClose(document: TextDocument)

  @JsonNotification("debug/message") fun debugMessage(message: DebugMessage)

  @JsonNotification("autocomplete/clearLastCandidate") fun autocompleteClearLastCandidate()

  @JsonNotification("autocomplete/completionSuggested")
  fun completionSuggested(logID: CompletionItemParams)

  @JsonNotification("autocomplete/completionAccepted")
  fun completionAccepted(logID: CompletionItemParams)

  @JsonNotification("$/cancelRequest") fun cancelRequest(cancelParams: CancelParams)
}
