package com.sourcegraph.cody.chat

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.intellij.xml.util.XmlStringUtil
import com.jetbrains.rd.util.AtomicReference
import com.sourcegraph.cody.agent.*
import com.sourcegraph.cody.agent.protocol.ChatMessage
import com.sourcegraph.cody.agent.protocol.ChatRestoreParams
import com.sourcegraph.cody.agent.protocol.ChatSubmitMessageParams
import com.sourcegraph.cody.agent.protocol.Speaker
import com.sourcegraph.cody.chat.ui.ChatPanel
import com.sourcegraph.cody.commands.CommandId
import com.sourcegraph.cody.config.RateLimitStateManager
import com.sourcegraph.cody.history.HistoryService
import com.sourcegraph.cody.history.state.ChatState
import com.sourcegraph.cody.history.state.MessageState
import com.sourcegraph.cody.vscode.CancellationToken
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.CodyBundle.fmt
import com.sourcegraph.common.UpgradeToCodyProNotification.Companion.isCodyProJetbrains
import com.sourcegraph.telemetry.GraphQlLogger
import java.util.*
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ExecutionException
import org.slf4j.LoggerFactory

typealias SessionId = String

interface ChatSession {

  fun sendMessage(text: String)

  fun receiveMessage(extensionMessage: ExtensionMessage)

  fun getCancellationToken(): CancellationToken

  fun getInternalId(): String
}

class AgentChatSession
private constructor(
    private val project: Project,
    newSessionId: CompletableFuture<SessionId>,
    private val internalId: String = UUID.randomUUID().toString(),
) : ChatSession {

  /**
   * There are situations (like startup of the chat) when we want to show UI immediately, but we
   * have not established connection with the agent yet. This is why we use CompletableFuture to
   * store the sessionId.
   */
  private val sessionId: AtomicReference<CompletableFuture<SessionId>> =
      AtomicReference(newSessionId)
  private val chatPanel: ChatPanel = ChatPanel(project, this)
  private val cancellationToken = AtomicReference(CancellationToken())
  private val messages = mutableListOf<ChatMessage>()

  init {
    cancellationToken.get().dispose()
  }

  fun getPanel(): ChatPanel = chatPanel

  fun hasSessionId(thatSessionId: SessionId): Boolean =
      sessionId.get().getNow(null) == thatSessionId

  fun restoreAgentSession(agent: CodyAgent) {
    synchronized(this) {
      // todo serialize model
      val model = "anthropic/claude-2.0"
      val messagesToReload =
          messages
              .toList()
              .dropWhile { it.speaker == Speaker.ASSISTANT }
              .fold(emptyList<ChatMessage>()) { acc, msg ->
                if (acc.lastOrNull()?.speaker == msg.speaker) acc else acc.plus(msg)
              }
      val restoreParams = ChatRestoreParams(model, messagesToReload, UUID.randomUUID().toString())
      val newSessionId = agent.server.chatRestore(restoreParams)
      sessionId.getAndSet(newSessionId)
    }
  }

  @RequiresEdt
  override fun sendMessage(text: String) {
    val displayText = XmlStringUtil.escapeString(text)
    val humanMessage = ChatMessage(Speaker.HUMAN, text, displayText)
    addMessage(humanMessage)

    CodyAgentService.applyAgentOnBackgroundThread(project) { agent ->
      val message =
          WebviewMessage(
              command = "submit",
              text = humanMessage.actualMessage(),
              submitType = "user",
              addEnhancedContext = chatPanel.isEnhancedContextEnabled(),
              // TODO(#242): allow to manually add files to the context via `@`
              contextFiles = listOf())

      val request =
          agent.server.chatSubmitMessage(ChatSubmitMessageParams(sessionId.get().get(), message))

      GraphQlLogger.logCodyEvent(project, "chat-question", "submitted")

      ApplicationManager.getApplication().invokeLater {
        createCancellationToken(
            onCancel = { request.cancel(true) },
            onFinish = { GraphQlLogger.logCodyEvent(project, "chat-question", "executed") })
      }
    }
  }

  override fun getCancellationToken(): CancellationToken = cancellationToken.get()

  override fun getInternalId(): String = internalId

  @Throws(ExecutionException::class, InterruptedException::class)
  override fun receiveMessage(extensionMessage: ExtensionMessage) {
    fun addAssistantResponseToChat(text: String, displayText: String? = null) {
      // Updates of the given message will always have the same UUID
      val messageId =
          UUID.nameUUIDFromBytes(extensionMessage.messages?.count().toString().toByteArray())
      ApplicationManager.getApplication().invokeLater {
        addMessage(ChatMessage(Speaker.ASSISTANT, text, displayText, id = messageId))
      }
    }

    try {
      val lastMessage = extensionMessage.messages?.lastOrNull()

      if (lastMessage?.error != null && extensionMessage.isMessageInProgress == false) {

        getCancellationToken().dispose()
        val rateLimitError = lastMessage.error.toRateLimitError()
        if (rateLimitError != null) {
          RateLimitStateManager.reportForChat(project, rateLimitError)
          isCodyProJetbrains(project).thenApply { isCodyPro ->
            val text =
                when {
                  rateLimitError.upgradeIsAvailable && isCodyPro ->
                      CodyBundle.getString("chat.rate-limit-error.upgrade")
                          .fmt(rateLimitError.limit?.let { " $it" } ?: "")
                  else -> CodyBundle.getString("chat.rate-limit-error.explain")
                }

            addAssistantResponseToChat(text)
          }
        } else {
          // Currently we ignore other kind of errors like context window limit reached
        }
      } else {
        RateLimitStateManager.invalidateForChat(project)
        if (extensionMessage.messages?.isNotEmpty() == true &&
            extensionMessage.isMessageInProgress == false) {
          getCancellationToken().dispose()
        } else {
          if (lastMessage?.text != null && extensionMessage.chatID != null) {
            addAssistantResponseToChat(lastMessage.text, lastMessage.displayText)
          }
        }
      }
    } catch (error: Exception) {
      getCancellationToken().dispose()
      logger.error(CodyBundle.getString("chat-session.error-title"), error)
      addAssistantResponseToChat(CodyBundle.getString("chat-session.error-title"))
    }
  }

  @RequiresEdt
  private fun addMessage(message: ChatMessage) {
    synchronized(messages) {
      if (messages.lastOrNull()?.id == message.id) {
        messages.removeLast()
      }
      messages.add(message)
      chatPanel.addOrUpdateMessage(message)
      HistoryService.getInstance().update(internalId, messages)
    }
  }

  @RequiresEdt
  private fun createCancellationToken(onCancel: () -> Unit, onFinish: () -> Unit) {
    synchronized(this) {
      val newCancellationToken = CancellationToken()
      newCancellationToken.onCancellationRequested { onCancel() }
      newCancellationToken.onFinished { onFinish() }
      cancellationToken.getAndSet(newCancellationToken).abort()
      chatPanel.registerCancellationToken(newCancellationToken)
    }
  }

  companion object {
    private val logger = LoggerFactory.getLogger(AgentChatSession::class.java)

    private val chatSessions: MutableList<AgentChatSession> = mutableListOf()

    fun getSession(sessionId: SessionId): AgentChatSession? =
        synchronized(chatSessions) { chatSessions.find { it.hasSessionId(sessionId) } }

    fun restoreAllSessions(agent: CodyAgent) {
      synchronized(chatSessions) { chatSessions.forEach { it.restoreAgentSession(agent) } }
    }

    fun removeAllSessions() {
      synchronized(chatSessions) { chatSessions.clear() }
    }

    fun removeSession(session: ChatSession) {
      synchronized(chatSessions) { chatSessions.remove(session) }
    }

    fun getSessionByInternalId(internalId: String?): AgentChatSession? =
        synchronized(chatSessions) { chatSessions.find { it.internalId == internalId } }

    @RequiresEdt
    fun createFromCommand(project: Project, commandId: CommandId): AgentChatSession {
      val sessionId =
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

      val chatSession = AgentChatSession(project, sessionId)

      chatSession.createCancellationToken(
          onCancel = {
            CodyAgentService.applyAgentOnBackgroundThread(project) { agent ->
              agent.server.webviewReceiveMessage(
                  WebviewReceiveMessageParams(sessionId.get(), WebviewMessage(command = "abort")))
            }
          },
          onFinish = {
            GraphQlLogger.logCodyEvent(project, "command:${commandId.displayName}", "executed")
          })

      chatSession.addMessage(ChatMessage(Speaker.HUMAN, commandId.displayName))
      synchronized(chatSessions) { chatSessions.add(chatSession) }
      return chatSession
    }

    @RequiresEdt
    fun createNew(project: Project): AgentChatSession {
      val sessionId = createNewPanel(project) { it.server.chatNew() }
      val chatSession = AgentChatSession(project, sessionId)
      synchronized(chatSessions) { chatSessions.add(chatSession) }
      return chatSession
    }

    @RequiresEdt
    fun createFromState(project: Project, state: ChatState): AgentChatSession {
      val sessionId = createNewPanel(project) { it.server.chatNew() }
      val chatSession = AgentChatSession(project, sessionId, state.internalId!!)
      for (message in state.messages) {
        val parsed =
            when (val speaker = message.speaker) {
              MessageState.SpeakerState.HUMAN -> Speaker.HUMAN
              MessageState.SpeakerState.ASSISTANT -> Speaker.ASSISTANT
              else -> error("unrecognized speaker $speaker")
            }
        val chatMessage = ChatMessage(parsed, message.text)
        chatSession.messages.add(chatMessage)
        chatSession.chatPanel.addOrUpdateMessage(chatMessage)
      }
      CodyAgentService.applyAgentOnBackgroundThread(project) { agent ->
        chatSession.restoreAgentSession(agent)
      }
      synchronized(chatSessions) { chatSessions.add(chatSession) }
      return chatSession
    }

    private fun createNewPanel(
        project: Project,
        newPanelAction: (CodyAgent) -> CompletableFuture<String>
    ): CompletableFuture<SessionId> {
      val sessionId = CompletableFuture<SessionId>()
      CodyAgentService.applyAgentOnBackgroundThread(project) { agent ->
        try {
          sessionId.complete(newPanelAction(agent).get())
        } catch (e: ExecutionException) {
          // Agent cannot gracefully recover when connection is lost, we need to restart it
          // TODO https://github.com/sourcegraph/jetbrains/issues/306
          logger.warn("Failed to load new chat, restarting agent", e)
          CodyAgentService.getInstance(project).restartAgent(project)
          Thread.sleep(5000)
          createNewPanel(project, newPanelAction)
        }
      }
      return sessionId
    }
  }
}
