package com.sourcegraph.cody.chat

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.UpdatableChat
import com.sourcegraph.cody.agent.CodyAgent
import com.sourcegraph.cody.agent.ExtensionMessage
import com.sourcegraph.cody.agent.WebviewMessage
import com.sourcegraph.cody.agent.protocol.*
import com.sourcegraph.cody.agent.protocol.ErrorCodeUtils.toErrorCode
import com.sourcegraph.cody.agent.protocol.RateLimitError.Companion.toRateLimitError
import com.sourcegraph.cody.config.RateLimitStateManager
import com.sourcegraph.cody.vscode.CancellationToken
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.CodyBundle.fmt
import com.sourcegraph.common.UpgradeToCodyProNotification.Companion.isCodyProJetbrains
import java.util.concurrent.ExecutionException
import java.util.concurrent.atomic.AtomicBoolean
import java.util.function.Consumer
import java.util.stream.Collectors
import org.eclipse.lsp4j.jsonrpc.ResponseErrorException
import org.slf4j.LoggerFactory

class Chat {
  val logger = LoggerFactory.getLogger(Chat::class.java)

  @Throws(ExecutionException::class, InterruptedException::class)
  fun sendMessageViaAgent(
      project: Project,
      humanMessage: ChatMessage,
      recipeId: String,
      chat: UpdatableChat,
      token: CancellationToken
  ) {
    val client = CodyAgent.getClient(project)
    val codyAgentServer = CodyAgent.getInitializedServer(project)
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
    if (recipeId == "chat-question") {
      codyAgentServer
          .thenAcceptAsync(
              { server ->
                try {
                  val reply =
                      server.chatSubmitMessage(
                          ChatSubmitMessageParams(
                              chat.id!!,
                              WebviewMessage(
                                  command = "submit",
                                  text = humanMessage.actualMessage(),
                                  submitType = "user",
                                  addEnhancedContext = true,
                                  // TODO(#242): allow to manually add files to the context via `@`
                                  contextFiles = listOf())))
                  token.onCancellationRequested { reply.cancel(true) }
                  reply.handle { lastReply, error ->
                    val rateLimitError =
                        if (lastReply.type == ExtensionMessage.Type.TRANSCRIPT &&
                            lastReply.messages?.lastOrNull()?.error != null) {
                          lastReply.messages.lastOrNull()?.error?.toRateLimitError()
                        } else {
                          null
                        }
                    val panelNotFoundError =
                        if (lastReply.type == ExtensionMessage.Type.ERRORS &&
                            lastReply.errors != null) {
                          lastReply.toPanelNotFoundError()
                        } else {
                          null
                        }
                    if (rateLimitError != null) {
                      handleRateLimitError(project, chat, rateLimitError)
                    } else if (panelNotFoundError != null) {
                      chat.loadNewChatId {
                        sendMessageViaAgent(project, humanMessage, recipeId, chat, token)
                      }
                    } else if (error != null) {
                      handleError(project, error, chat)
                      null
                    } else {
                      RateLimitStateManager.invalidateForChat(project)
                    }
                  }
                } catch (ignored: Exception) {
                  // Ignore bugs in the agent when executing recipes
                  logger.warn("Ignored error executing recipe: $ignored")
                }
              },
              CodyAgent.executorService)
          .get()
    } else {
      // TODO: migrate recipes to new webview-based API and then delete this else condition.
      codyAgentServer
          .thenAcceptAsync(
              { server ->
                try {
                  val recipesExecuteFuture =
                      server.recipesExecute(
                          ExecuteRecipeParams(recipeId, humanMessage.actualMessage()))
                  token.onCancellationRequested { recipesExecuteFuture.cancel(true) }
                  recipesExecuteFuture.handle { _, error ->
                    if (error != null) {
                      handleError(project, error, chat)
                      null
                    } else {
                      RateLimitStateManager.invalidateForChat(project)
                    }
                  }
                } catch (ignored: Exception) {
                  // Ignore bugs in the agent when executing recipes
                  logger.warn("Ignored error executing recipe: $ignored")
                }
              },
              CodyAgent.executorService)
          .get()
    }
  }

  private fun handleRateLimitError(
      project: Project,
      chat: UpdatableChat,
      rateLimitError: RateLimitError
  ) {
    RateLimitStateManager.reportForChat(project, rateLimitError)

    ApplicationManager.getApplication().executeOnPooledThread {
      val codyProJetbrains = isCodyProJetbrains(project)
      val text =
          when {
            rateLimitError.upgradeIsAvailable && codyProJetbrains ->
                CodyBundle.getString("chat.rate-limit-error.upgrade")
                    .fmt(rateLimitError.limit?.let { " $it" } ?: "")
            else -> CodyBundle.getString("chat.rate-limit-error.explain")
          }

      val chatMessage = ChatMessage(Speaker.ASSISTANT, text, null)
      chat.addMessageToChat(chatMessage)
      chat.finishMessageProcessing()
    }
    return
  }

  private fun handleError(project: Project, throwable: Throwable, chat: UpdatableChat) {
    if (throwable is ResponseErrorException) {
      val errorCode = throwable.toErrorCode()
      if (errorCode == ErrorCode.RateLimitError) {
        handleRateLimitError(project, chat, throwable.toRateLimitError())
      }
    }
    RateLimitStateManager.invalidateForChat(project)

    // todo: error handling for other error codes and throwables
    chat.finishMessageProcessing()
  }
}
