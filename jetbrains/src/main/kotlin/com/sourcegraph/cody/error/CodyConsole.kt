package com.sourcegraph.cody.error

import com.intellij.execution.actions.ClearConsoleAction
import com.intellij.execution.filters.TextConsoleBuilderFactory
import com.intellij.execution.ui.ConsoleViewContentType
import com.intellij.openapi.actionSystem.*
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.SimpleToolWindowPanel
import com.intellij.openapi.wm.ToolWindowManager
import com.sourcegraph.cody.agent.protocol_generated.DebugMessage
import com.sourcegraph.config.ConfigUtil

@Service(Service.Level.PROJECT)
class CodyConsole(val project: Project) {
  private val logger = Logger.getInstance(CodyConsole::class.java)
  private val toolWindow = ToolWindowManager.getInstance(project).getToolWindow("Problems View")
  private val consoleViews = mutableMapOf<String, com.intellij.execution.ui.ConsoleView>()

  private val storedMessages = mutableMapOf<String, MutableList<DebugMessage>>()
  private val showErrorsAndWarnsOnly = mutableMapOf<String, Boolean>()

  fun addMessage(message: DebugMessage) {
    if (toolWindow?.isDisposed != false) return
    storedMessages.getOrPut(message.channel) { mutableListOf() }.add(message)
    printMessage(message, useLogger = true)
  }

  private fun printMessage(message: DebugMessage, useLogger: Boolean = false) {
    val channel = message.channel
    val consoleView = getOrCreateConsoleForChannel(channel)

    val isErrorOrWarn = message.level == "error" || message.level == "warn"
    if (showErrorsAndWarnsOnly.getOrPut(channel) { false } && !isErrorOrWarn) {
      return
    }

    val messageText = "${message.message}\n"
    if (isErrorOrWarn) {
      consoleView.print(messageText, ConsoleViewContentType.ERROR_OUTPUT)
      if (useLogger) logger.warn("$channel: ${message.message}")
    } else if (ConfigUtil.isCodyDebugEnabled() || ConfigUtil.isDevMode()) {
      consoleView.print(messageText, ConsoleViewContentType.NORMAL_OUTPUT)
      if (useLogger) logger.info("$channel: ${message.message}")
    }
  }

  private fun getOrCreateConsoleForChannel(channel: String): com.intellij.execution.ui.ConsoleView {
    return consoleViews.getOrPut(channel) {
      val consoleView = TextConsoleBuilderFactory.getInstance().createBuilder(project).console

      val toggleAction =
          object :
              ToggleAction(
                  { "Only Show Errors And Warnings" }, com.intellij.icons.AllIcons.General.Error) {
            override fun isSelected(e: AnActionEvent): Boolean {
              return showErrorsAndWarnsOnly[channel] ?: false
            }

            override fun getActionUpdateThread(): ActionUpdateThread {
              return ActionUpdateThread.EDT
            }

            override fun setSelected(e: AnActionEvent, state: Boolean) {
              showErrorsAndWarnsOnly[channel] = state
              refreshConsole(channel)
            }
          }

      val clearAction =
          object : ClearConsoleAction() {
            override fun actionPerformed(e: AnActionEvent) {
              consoleView.clear()
              storedMessages[channel]?.clear()
            }

            override fun getActionUpdateThread(): ActionUpdateThread {
              return ActionUpdateThread.EDT
            }
          }

      runInEdt {
        if (toolWindow?.isDisposed != false) return@runInEdt

        val component = consoleView.component
        val factory = toolWindow.contentManager.factory

        val actions = consoleView.createConsoleActions().toMutableList()
        actions.removeIf({ it is ClearConsoleAction })
        actions.add(clearAction)
        actions.add(toggleAction)

        val actionGroup = DefaultActionGroup(actions)
        val toolbar =
            ActionManager.getInstance().createActionToolbar("CodyConsole", actionGroup, false)
        toolbar.targetComponent = component

        val panel = SimpleToolWindowPanel(false, true)
        panel.toolbar = toolbar.component
        panel.setContent(component)

        val content = factory.createContent(panel, channel, true)
        toolWindow.contentManager.addContent(content)
      }

      consoleView
    }
  }

  private fun refreshConsole(channel: String) {
    val consoleView = consoleViews[channel] ?: return
    val messages = storedMessages[channel] ?: return

    runInEdt {
      consoleView.clear()
      messages.forEach { message -> printMessage(message) }
    }
  }

  companion object {
    @JvmStatic
    fun getInstance(project: Project): CodyConsole {
      return project.service<CodyConsole>()
    }
  }
}
