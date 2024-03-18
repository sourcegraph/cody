package com.sourcegraph.cody.chat

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.intellij.util.ui.UIUtil
import com.intellij.xml.util.XmlStringUtil
import com.jetbrains.rd.util.AtomicReference
import com.jetbrains.rd.util.getThrowableText
import com.sourcegraph.cody.agent.CodyAgent
import com.sourcegraph.cody.agent.CodyAgentException
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.ExtensionMessage
import com.sourcegraph.cody.agent.WebviewMessage
import com.sourcegraph.cody.agent.WebviewReceiveMessageParams
import com.sourcegraph.cody.agent.protocol.ChatError
import com.sourcegraph.cody.agent.protocol.ChatMessage
import com.sourcegraph.cody.agent.protocol.ChatModelsParams
import com.sourcegraph.cody.agent.protocol.ChatModelsResponse
import com.sourcegraph.cody.agent.protocol.ChatRestoreParams
import com.sourcegraph.cody.agent.protocol.ChatSubmitMessageParams
import com.sourcegraph.cody.agent.protocol.ContextItem
import com.sourcegraph.cody.agent.protocol.Speaker
import com.sourcegraph.cody.chat.ui.ChatPanel
import com.sourcegraph.cody.chat.ui.LlmDropdownData
import com.sourcegraph.cody.commands.CommandId
import com.sourcegraph.cody.config.CodyAuthenticationManager
import com.sourcegraph.cody.config.RateLimitStateManager
import com.sourcegraph.cody.error.CodyErrorSubmitter
import com.sourcegraph.cody.history.HistoryService
import com.sourcegraph.cody.history.state.ChatState
import com.sourcegraph.cody.history.state.MessageState
import com.sourcegraph.cody.vscode.CancellationToken
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.CodyBundle.fmt
import com.sourcegraph.telemetry.GraphQlLogger
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ExecutionException
import java.util.concurrent.TimeUnit
import org.slf4j.LoggerFactory

class AgentChatSession
private constructor(
    private val project: Project,
    newConnectionId: CompletableFuture<ConnectionId>,
    private val internalId: String = UUID.randomUUID().toString(),
    private val chatModelProviderFromState: ChatModelsResponse.ChatModelProvider? = null,
) : ChatSession {
  /**
   * There are situations (like startup of the chat) when we want to show UI immediately, but we
   * have not established connection with the agent yet. This is why we use CompletableFuture to
   * store the connectionId.
   */
  private val connectionId: AtomicReference<CompletableFuture<ConnectionId>> =
      AtomicReference(newConnectionId)
  private val chatPanel: ChatPanel =
      ChatPanel(project, chatSession = this, chatModelProviderFromState)
  private val cancellationToken = AtomicReference(CancellationToken())
  private val messages = mutableListOf<ChatMessage>()

  init {
    cancellationToken.get().dispose()
    fetchLlms()
  }

  fun restoreAgentSession(
      agent: CodyAgent,
      chatModelProvider: ChatModelsResponse.ChatModelProvider? = null
  ) {
    val messagesToReload =
        messages
            .toList()
            .dropWhile { it.speaker == Speaker.ASSISTANT }
            .fold(emptyList<ChatMessage>()) { acc, msg ->
              if (acc.lastOrNull()?.speaker == msg.speaker) acc else acc.plus(msg)
            }

    val restoreParams =
        ChatRestoreParams(
            // TODO: Change in the agent handling chat restore with null model
            chatModelProvider?.model,
            messagesToReload,
            UUID.randomUUID().toString())
    val newConnectionId = agent.server.chatRestore(restoreParams)
    connectionId.getAndSet(newConnectionId)
    fetchLlms()
  }

  fun getPanel(): ChatPanel = chatPanel

  override fun getConnectionId(): ConnectionId? = connectionId.get().getNow(null)

  fun hasConnectionId(thatConnectionId: ConnectionId): Boolean =
      getConnectionId() == thatConnectionId

  override fun getInternalId(): String = internalId

  override fun getCancellationToken(): CancellationToken = cancellationToken.get()

  private val logger = LoggerFactory.getLogger(ChatSession::class.java)

  @RequiresEdt
  override fun sendMessage(text: String, contextItems: List<ContextItem>) {
    val displayText = XmlStringUtil.escapeString(text)
    val humanMessage =
        ChatMessage(
            Speaker.HUMAN,
            text,
            displayText,
        )
    addMessageAtIndex(humanMessage, index = messages.count())

    val responsePlaceholder =
        ChatMessage(
            Speaker.ASSISTANT,
            text = "",
            displayText = "",
        )
    addMessageAtIndex(responsePlaceholder, index = messages.count())

    submitMessageToAgent(humanMessage, contextItems)
  }

  private fun submitMessageToAgent(humanMessage: ChatMessage, contextItems: List<ContextItem>) {
    CodyAgentService.withAgentRestartIfNeeded(
        project,
        callback = { agent ->
          val message =
              WebviewMessage(
                  command = "submit",
                  text = humanMessage.actualMessage(),
                  submitType = "user",
                  addEnhancedContext = chatPanel.isEnhancedContextEnabled(),
                  contextFiles = contextItems)

          try {
            val request =
                agent.server.chatSubmitMessage(
                    ChatSubmitMessageParams(connectionId.get().get(), message))

            GraphQlLogger.logCodyEvent(project, "chat-question", "submitted")

            ApplicationManager.getApplication().invokeLater {
              createCancellationToken(
                  onCancel = { request.cancel(true) },
                  onFinish = { GraphQlLogger.logCodyEvent(project, "chat-question", "executed") })
            }
          } catch (e: Exception) {
            createCancellationToken(onCancel = {}, onFinish = {})
            handleException(e)
            throw e
          }
        },
        onFailure = { e ->
          createCancellationToken(onCancel = {}, onFinish = {})
          handleException(e)
        })
  }

  @Throws(ExecutionException::class, InterruptedException::class)
  override fun receiveMessage(extensionMessage: ExtensionMessage) {
    try {
      val lastMessage = extensionMessage.messages?.lastOrNull()
      if (lastMessage?.error != null && extensionMessage.isMessageInProgress == false) {
        handleChatError(lastMessage.error)
      } else {
        RateLimitStateManager.invalidateForChat(project)
        if (extensionMessage.messages?.isNotEmpty() == true &&
            extensionMessage.isMessageInProgress == false) {
          getCancellationToken().dispose()
        } else {
          if (extensionMessage.chatID != null && extensionMessage.messages != null) {
            extensionMessage.messages.forEachIndexed { index, incomingMessage ->
              val sessionMessage = messages.getOrNull(index)
              if (sessionMessage != incomingMessage) {
                ApplicationManager.getApplication().invokeLater {
                  addMessageAtIndex(incomingMessage, index)
                }
              }
            }
          }
        }
      }
    } catch (exception: Exception) {
      handleException(exception)
    }
  }

  private fun handleChatError(chatError: ChatError) {
    try {
      CodyAgentService.setAgentError(project, chatError.message)

      val rateLimitError = chatError.toRateLimitError()
      val errorMessage =
          if (rateLimitError != null) {
            RateLimitStateManager.reportForChat(project, rateLimitError)
            when {
              rateLimitError.upgradeIsAvailable ->
                  CodyBundle.getString("chat.rate-limit-error.upgrade")
              else -> CodyBundle.getString("chat.rate-limit-error.explain")
            }
          } else CodyBundle.getString("chat.general-error").fmt(chatError.message, "")

      addErrorMessageAsAssistantMessage(errorMessage)
    } finally {
      getCancellationToken().abort()
    }
  }

  private fun handleException(e: Exception) {
    try {
      CodyAgentService.setAgentError(project, e)

      val message = ((e.cause as? CodyAgentException) ?: e).message ?: e.toString()
      val errorReportLink = CodyErrorSubmitter().getEncodedUrl(e.getThrowableText(), message)
      val errorReportMsg = CodyBundle.getString("chat.general-error.report").fmt(errorReportLink)
      addErrorMessageAsAssistantMessage(
          CodyBundle.getString("chat.general-error").fmt(message, errorReportMsg))
    } finally {
      getCancellationToken().abort()
    }
  }

  private fun addErrorMessageAsAssistantMessage(chatMessage: String) {
    UIUtil.invokeLaterIfNeeded {
      addMessageAtIndex(ChatMessage(Speaker.ASSISTANT, chatMessage), messages.count() - 1)
    }
  }

  override fun sendWebviewMessage(message: WebviewMessage) {
    CodyAgentService.withAgentRestartIfNeeded(project) { agent ->
      agent.server.webviewReceiveMessage(
          WebviewReceiveMessageParams(this.connectionId.get().get(), message))
    }
  }

  fun receiveWebviewExtensionMessage(message: ExtensionMessage) {
    when (message.type) {
      ExtensionMessage.Type.USER_CONTEXT_FILES -> {
        if (message.userContextFiles is List<*>) {
          this.chatPanel.promptPanel.setContextFilesSelector(message.userContextFiles)
        }
      }
      else -> {
        logger.debug(String.format("unknown message type: %s", message.type))
      }
    }
  }

  @RequiresEdt
  private fun addMessageAtIndex(message: ChatMessage, index: Int) {
    val messageToUpdate = messages.getOrNull(index)
    if (messageToUpdate != null) {
      messages[index] = message
    } else {
      messages.add(message)
    }

    chatPanel.addOrUpdateMessage(message, index)
    HistoryService.getInstance(project).updateChatMessages(internalId, messages)
  }

  @RequiresEdt
  private fun createCancellationToken(onCancel: () -> Unit, onFinish: () -> Unit) {
    val newCancellationToken = CancellationToken()
    newCancellationToken.onCancellationRequested { onCancel() }
    newCancellationToken.onFinished { onFinish() }
    cancellationToken.getAndSet(newCancellationToken).abort()
    chatPanel.registerCancellationToken(newCancellationToken)
  }

  private fun fetchLlms() {
    if (chatModelProviderFromState != null) {
      return
    }

    CodyAgentService.withAgent(project) { agent ->
      val chatModels = agent.server.chatModels(ChatModelsParams(connectionId.get().get()))
      val response =
          chatModels.completeOnTimeout(null, 4, TimeUnit.SECONDS).get() ?: return@withAgent

      val activeAccountType = CodyAuthenticationManager.instance.getActiveAccount(project)
      val isCurrentUserFree =
          if (activeAccountType?.isDotcomAccount() == true) {
            agent.server.isCurrentUserPro().completeOnTimeout(false, 4, TimeUnit.SECONDS).get() ==
                false
          } else false
      chatPanel.updateLlmDropdownModels(LlmDropdownData(response.models, isCurrentUserFree))
    }
  }

  companion object {
    @RequiresEdt
    fun createNew(project: Project): AgentChatSession {
      val connectionId = createNewPanel(project) { it.server.chatNew() }
      val chatSession = AgentChatSession(project, connectionId)
      AgentChatSessionService.getInstance(project).addSession(chatSession)
      return chatSession
    }

    @RequiresEdt
    fun createFromCommand(project: Project, commandId: CommandId): AgentChatSession {
      val connectionId =
          createNewPanel(project) { agent: CodyAgent ->
            when (commandId) {
              CommandId.Explain -> agent.server.commandsExplain()
              CommandId.Smell -> agent.server.commandsSmell()
              CommandId.Test -> agent.server.commandsTest()
            }
          }

      ApplicationManager.getApplication().executeOnPooledThread {
        GraphQlLogger.logCodyEvent(project, "command:${commandId.displayName}", "submitted")
      }

      val chatSession = AgentChatSession(project, connectionId)

      chatSession.createCancellationToken(
          onCancel = { chatSession.sendWebviewMessage(WebviewMessage(command = "abort")) },
          onFinish = {
            GraphQlLogger.logCodyEvent(project, "command:${commandId.displayName}", "executed")
          })

      chatSession.addMessageAtIndex(
          ChatMessage(
              Speaker.HUMAN,
              commandId.displayName,
          ),
          chatSession.messages.count())
      chatSession.addMessageAtIndex(
          ChatMessage(
              Speaker.ASSISTANT,
              text = "",
              displayText = "",
          ),
          chatSession.messages.count())
      AgentChatSessionService.getInstance(project).addSession(chatSession)
      return chatSession
    }

    @RequiresEdt
    fun createFromState(project: Project, state: ChatState): AgentChatSession {
      val agentChatSession = CompletableFuture<AgentChatSession>()
      createNewPanel(project) { codyAgent ->
        val newConnectionId = codyAgent.server.chatNew()
        val modelFromState =
            state.llm?.let {
              ChatModelsResponse.ChatModelProvider(
                  default = it.model == null,
                  codyProOnly = false,
                  provider = it.provider,
                  title = it.title,
                  model = it.model ?: "")
            }

        val chatSession =
            AgentChatSession(project, newConnectionId, state.internalId!!, modelFromState)
        val chatMessages =
            state.messages.map { message ->
              val parsed =
                  when (val speaker = message.speaker) {
                    MessageState.SpeakerState.HUMAN -> Speaker.HUMAN
                    MessageState.SpeakerState.ASSISTANT -> Speaker.ASSISTANT
                    else -> error("unrecognized speaker $speaker")
                  }

              ChatMessage(speaker = parsed, message.text)
            }
        chatSession.messages.addAll(chatMessages)
        ApplicationManager.getApplication().invokeLater {
          chatSession.chatPanel.addAllMessages(chatMessages)
        }

        if (modelFromState?.model.isNullOrEmpty()) {
          chatSession.restoreAgentSession(codyAgent)
        } else {
          chatSession.restoreAgentSession(codyAgent, modelFromState)
        }

        AgentChatSessionService.getInstance(project).addSession(chatSession)
        agentChatSession.complete(chatSession)
        newConnectionId
      }
      return agentChatSession.completeOnTimeout(null, 15, TimeUnit.SECONDS).get()
    }

    private fun createNewPanel(
        project: Project,
        newPanelAction: (CodyAgent) -> CompletableFuture<String>
    ): CompletableFuture<ConnectionId> {
      val result = CompletableFuture<ConnectionId>()
      CodyAgentService.withAgentRestartIfNeeded(project) { agent ->
        newPanelAction(agent).whenComplete { value, throwable ->
          if (throwable != null) result.completeExceptionally(throwable) else result.complete(value)
        }
      }
      return result
    }
  }
}
