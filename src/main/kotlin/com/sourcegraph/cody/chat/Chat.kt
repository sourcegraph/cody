package com.sourcegraph.cody.chat

import com.sourcegraph.cody.UpdatableChat
import com.sourcegraph.cody.agent.CodyAgent
import com.sourcegraph.cody.agent.CodyAgentClient
import com.sourcegraph.cody.agent.CodyAgentServer
import com.sourcegraph.cody.agent.protocol.*
import com.sourcegraph.cody.agent.protocol.ErrorCodeUtils.toErrorCode
import com.sourcegraph.cody.agent.protocol.RateLimitError.Companion.toRateLimitError
import com.sourcegraph.cody.vscode.CancellationToken
import java.time.Duration
import java.time.OffsetDateTime
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ExecutionException
import java.util.concurrent.atomic.AtomicBoolean
import java.util.function.Consumer
import java.util.stream.Collectors
import org.apache.commons.lang3.time.DurationFormatUtils
import org.eclipse.lsp4j.jsonrpc.ResponseErrorException

class Chat {
  @Throws(ExecutionException::class, InterruptedException::class)
  fun sendMessageViaAgent(
      client: CodyAgentClient,
      codyAgentServer: CompletableFuture<CodyAgentServer>,
      humanMessage: ChatMessage,
      recipeId: String,
      chat: UpdatableChat,
      token: CancellationToken
  ) {
    val isFirstMessage = AtomicBoolean(false)
    client.onFinishedProcessing = Runnable { chat.finishMessageProcessing() }
    client.onChatUpdateMessageInProgress = Consumer { agentChatMessage ->
      val agentChatMessageText = agentChatMessage.text ?: return@Consumer
      val chatMessage =
          ChatMessage(Speaker.ASSISTANT, agentChatMessageText, agentChatMessage.displayText)
      if (isFirstMessage.compareAndSet(false, true)) {
        val contextMessages =
            agentChatMessage.contextFiles
                ?.stream()
                ?.map { contextFile: ContextFile ->
                  ContextMessage(Speaker.ASSISTANT, agentChatMessageText, contextFile)
                }
                ?.collect(Collectors.toList())
                ?: emptyList()
        chat.displayUsedContext(contextMessages)
        chat.addMessageToChat(chatMessage)
      } else {
        chat.updateLastMessage(chatMessage)
      }
    }
    codyAgentServer
        .thenAcceptAsync(
            { server ->
              try {
                val recipesExecuteFuture =
                    server.recipesExecute(
                        ExecuteRecipeParams(recipeId, humanMessage.actualMessage()))
                token.onCancellationRequested { recipesExecuteFuture.cancel(true) }
                recipesExecuteFuture.exceptionally { error ->
                  handleError(error, chat)
                  null
                }
              } catch (ignored: Exception) {
                // Ignore bugs in the agent when executing recipes
              }
            },
            CodyAgent.executorService)
        .get()
  }

  private fun handleError(throwable: Throwable, chat: UpdatableChat) {
    if (throwable is ResponseErrorException) {
      val errorCode = throwable.toErrorCode()
      if (errorCode == ErrorCode.RateLimitError) {
        val rateLimitError = throwable.toRateLimitError()
        val quotaString = rateLimitError.limit?.let { " ${rateLimitError.limit}" } ?: ""
        val currentDateTime = OffsetDateTime.now()
        val resetString =
            rateLimitError.retryAfter
                ?.let { Duration.between(currentDateTime, it) }
                ?.let { DurationFormatUtils.formatDurationWords(it.toMillis(), true, true) }
                ?.let { " Retry after $it." }
                ?: ""
        val text =
            "<b>Request failed:</b> You've used all${quotaString} messages. The allowed number of request per day is limited at the moment to ensure the service stays functional.${resetString}"
        val chatMessage = ChatMessage(Speaker.ASSISTANT, text, null)
        chat.addMessageToChat(chatMessage)
        chat.finishMessageProcessing()
        return
      }
    }

    // todo: error handling for other error codes and throwables
    chat.finishMessageProcessing()
  }
}
