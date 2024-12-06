package com.sourcegraph.cody.config

import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.WindowManager
import com.sourcegraph.cody.agent.CodyAgent
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol_generated.Window_DidChangeFocusParams
import java.awt.event.WindowAdapter
import java.awt.event.WindowEvent

class CodyWindowAdapter(private val project: Project) : WindowAdapter() {

  override fun windowActivated(e: WindowEvent?) {
    super.windowActivated(e)
    CodyAgentService.withAgent(project) { agent: CodyAgent ->
      agent.server.window_didChangeFocus(Window_DidChangeFocusParams(true))
    }
  }

  override fun windowDeactivated(e: WindowEvent?) {
    super.windowDeactivated(e)
    CodyAgentService.withAgent(project) { agent: CodyAgent ->
      agent.server.window_didChangeFocus(Window_DidChangeFocusParams(false))
    }
  }

  companion object {
    fun addWindowFocusListener(project: Project) {
      val frame = WindowManager.getInstance().getFrame(project)
      val listener = CodyWindowAdapter(project)
      frame?.addWindowListener(listener)
      Disposer.register(CodyAgentService.getInstance(project)) {
        frame?.removeWindowListener(listener)
      }
    }
  }
}
