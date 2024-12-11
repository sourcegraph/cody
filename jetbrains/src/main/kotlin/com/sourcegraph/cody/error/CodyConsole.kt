package com.sourcegraph.cody.error

import com.intellij.execution.filters.TextConsoleBuilderFactory
import com.intellij.execution.ui.ConsoleViewContentType
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.ui.content.Content
import com.sourcegraph.cody.agent.protocol_generated.DebugMessage
import com.sourcegraph.config.ConfigUtil

@Service(Service.Level.PROJECT)
class CodyConsole(project: Project) {
  private val logger = Logger.getInstance(CodyConsole::class.java)
  private val consoleView = TextConsoleBuilderFactory.getInstance().createBuilder(project).console
  private val toolWindow = ToolWindowManager.getInstance(project).getToolWindow("Problems View")
  var content: Content? = null

  fun addMessage(message: DebugMessage) {
    runInEdt {
      val messageText = "${message.channel}: ${message.message}\n"
      if (message.level == "error" || message.level == "warn") {
        content?.let { toolWindow?.contentManager?.setSelectedContent(it) }
        consoleView.print(messageText, ConsoleViewContentType.ERROR_OUTPUT)
        logger.warn(messageText)
      } else if (ConfigUtil.isCodyDebugEnabled()) {
        consoleView.print(messageText, ConsoleViewContentType.NORMAL_OUTPUT)
        logger.info(messageText)
      }

      if (ConfigUtil.isCodyDebugEnabled() && ConfigUtil.isDevMode()) {
        toolWindow?.contentManager?.getReady(this)?.doWhenDone {
          if (!toolWindow.isVisible) {
            toolWindow.show()
          }
        }
      }
    }
  }

  init {
    runInEdt {
      val factory = toolWindow?.contentManager?.factory
      content = factory?.createContent(consoleView.component, "Cody Console", true)
      content?.let { toolWindow?.contentManager?.addContent(it) }
    }
  }

  companion object {
    @JvmStatic
    fun getInstance(project: Project): CodyConsole {
      return project.service<CodyConsole>()
    }
  }
}
