package com.sourcegraph.cody.autocomplete

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.ErrorCode
import com.sourcegraph.cody.agent.protocol.ErrorCodeUtils.toErrorCode
import com.sourcegraph.cody.agent.protocol.RateLimitError.Companion.toRateLimitError
import com.sourcegraph.cody.agent.protocol_extensions.Position
import com.sourcegraph.cody.agent.protocol_extensions.ProtocolTextDocumentExt
import com.sourcegraph.cody.agent.protocol_generated.AutocompleteParams
import com.sourcegraph.cody.agent.protocol_generated.AutocompleteResult
import com.sourcegraph.cody.agent.protocol_generated.Ignore_TestResult
import com.sourcegraph.cody.agent.protocol_generated.Position
import com.sourcegraph.cody.agent.protocol_generated.Range
import com.sourcegraph.cody.agent.protocol_generated.SelectedCompletionInfo
import com.sourcegraph.cody.ignore.ActionInIgnoredFileNotification
import com.sourcegraph.cody.ignore.IgnoreOracle
import com.sourcegraph.cody.statusbar.CodyStatus
import com.sourcegraph.cody.statusbar.CodyStatusService.Companion.notifyApplication
import com.sourcegraph.cody.statusbar.CodyStatusService.Companion.resetApplication
import com.sourcegraph.cody.vscode.CancellationToken
import com.sourcegraph.cody.vscode.InlineCompletionTriggerKind
import com.sourcegraph.cody.vscode.TextDocument
import com.sourcegraph.common.UpgradeToCodyProNotification
import java.util.concurrent.CancellationException
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionException
import java.util.concurrent.TimeUnit
import org.eclipse.lsp4j.jsonrpc.ResponseErrorException

object Utils {
  fun triggerAutocompleteAsync(
      project: Project,
      editor: Editor,
      offset: Int,
      textDocument: TextDocument,
      triggerKind: InlineCompletionTriggerKind,
      cancellationToken: CancellationToken,
      lookupString: String?,
      originalText: String,
      logger: Logger,
      successCallback: (AutocompleteResult) -> Unit,
  ): CompletableFuture<out AutocompleteResult?> {
    val position = textDocument.positionAt(offset)
    val lineNumber = editor.document.getLineNumber(offset)
    var startPosition = 0
    if (!lookupString.isNullOrEmpty()) {
      startPosition = findLastCommonSuffixElementPosition(originalText, lookupString)
    }

    val virtualFile =
        FileDocumentManager.getInstance().getFile(editor.document)
            ?: return CompletableFuture.completedFuture(null)
    val fileUri =
        ProtocolTextDocumentExt.fileUriFor(virtualFile)
            ?: return CompletableFuture.completedFuture(null)

    val params =
        if (lookupString.isNullOrEmpty())
            AutocompleteParams(
                uri = fileUri,
                position = Position(position.line, position.character),
                triggerKind =
                    if (triggerKind == InlineCompletionTriggerKind.INVOKE)
                        AutocompleteParams.TriggerKindEnum.Invoke
                    else AutocompleteParams.TriggerKindEnum.Automatic)
        else
            AutocompleteParams(
                uri = fileUri,
                position = Position(position.line, position.character),
                triggerKind = AutocompleteParams.TriggerKindEnum.Automatic,
                selectedCompletionInfo =
                    SelectedCompletionInfo(
                        range =
                            if (startPosition < 0) Range(position, position)
                            else Range(Position(lineNumber, startPosition), position),
                        text = lookupString))
    notifyApplication(project, CodyStatus.AutocompleteInProgress)

    val resultOuter = CompletableFuture<AutocompleteResult?>()
    CodyAgentService.withAgent(project) { agent ->
      if (triggerKind == InlineCompletionTriggerKind.INVOKE &&
          IgnoreOracle.getInstance(project).policyForUri(virtualFile.url, agent).get() !=
              Ignore_TestResult.PolicyEnum.Use) {
        ActionInIgnoredFileNotification.maybeNotify(project)
        resetApplication(project)
        resultOuter.cancel(true)
      } else {
        val completions = agent.server.autocomplete_execute(params)

        // Important: we have to `.cancel()` the original `CompletableFuture<T>` from lsp4j. As soon
        // as we use `thenAccept()` we get a new instance of `CompletableFuture<Void>` which does
        // not correctly propagate the cancellation to the agent.
        cancellationToken.onCancellationRequested { completions.cancel(true) }

        ApplicationManager.getApplication().executeOnPooledThread {
          completions
              .handle { result, error ->
                if (error != null) {
                  if (triggerKind == InlineCompletionTriggerKind.INVOKE ||
                      !UpgradeToCodyProNotification.isFirstRLEOnAutomaticAutocompletionsShown) {
                    handleError(project, error)
                  }
                } else if (result != null && result.items.isNotEmpty()) {
                  UpgradeToCodyProNotification.isFirstRLEOnAutomaticAutocompletionsShown = false
                  UpgradeToCodyProNotification.autocompleteRateLimitError.set(null)
                  successCallback(result)
                  resultOuter.complete(result)
                }
                null
              }
              .exceptionally { error: Throwable? ->
                if (!(error is CancellationException || error is CompletionException)) {
                  logger.warn("failed autocomplete request $params", error)
                }
                null
              }
              .completeOnTimeout(null, 3, TimeUnit.SECONDS)
              .thenRun { // This is a terminal operation, so we needn't call get().
                resetApplication(project)
                resultOuter.complete(null)
              }
        }
      }
    }
    cancellationToken.onCancellationRequested { resultOuter.cancel(true) }
    return resultOuter
  }

  private fun handleError(project: Project, error: Throwable?) {
    if (error is ResponseErrorException) {
      if (error.toErrorCode() == ErrorCode.RateLimitError) {
        val rateLimitError = error.toRateLimitError()
        UpgradeToCodyProNotification.autocompleteRateLimitError.set(rateLimitError)
        UpgradeToCodyProNotification.isFirstRLEOnAutomaticAutocompletionsShown = true
        ApplicationManager.getApplication().executeOnPooledThread {
          UpgradeToCodyProNotification.notify(error.toRateLimitError(), project)
        }
      }
    }
  }

  private fun findLastCommonSuffixElementPosition(
      stringToFindSuffixIn: String,
      suffix: String
  ): Int {
    var i = 0
    while (i <= suffix.length) {
      val partY = suffix.substring(0, suffix.length - i)
      if (stringToFindSuffixIn.endsWith(partY)) {
        return stringToFindSuffixIn.length - (suffix.length - i)
      }
      i++
    }
    return 0
  }
}
