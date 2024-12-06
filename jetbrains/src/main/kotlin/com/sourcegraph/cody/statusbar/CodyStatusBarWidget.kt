package com.sourcegraph.cody.statusbar

import com.intellij.ide.DataManager
import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.openapi.ui.popup.ListPopup
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.openapi.wm.WindowManager
import com.intellij.openapi.wm.impl.status.EditorBasedStatusBarPopup
import com.intellij.util.ui.GraphicsUtil

class CodyStatusBarWidget(project: Project) : EditorBasedStatusBarPopup(project, false) {
  override fun ID(): String = CodyWidgetFactory.ID

  override fun getWidgetState(file: VirtualFile?): WidgetState {
    val currentStatus = CodyStatusService.getCurrentStatus(project)
    if (currentStatus == CodyStatus.CodyDisabled) {
      return WidgetState.HIDDEN
    }
    // Remote environment does not support rendering icons, so we use a placeholder text instead
    val text = if (GraphicsUtil.isRemoteEnvironment()) "Cody" else ""
    val state = WidgetState(currentStatus.presentableText, text, true)
    state.icon = currentStatus.icon
    return state
  }

  override fun createPopup(context: DataContext): ListPopup {
    val actionGroup =
        ActionManager.getInstance().getAction("CodyStatusBarActions") as? ActionGroup
            ?: CodyStatusBarActionGroup()
    return JBPopupFactory.getInstance()
        .createActionGroupPopup(
            "Cody",
            actionGroup,
            DataManager.getInstance().getDataContext(this.component),
            JBPopupFactory.ActionSelectionAid.SPEEDSEARCH,
            true)
  }

  override fun createInstance(project: Project): StatusBarWidget {
    return CodyStatusBarWidget(project)
  }

  companion object {

    fun update(project: Project) {
      val widget: CodyStatusBarWidget? = findWidget(project)
      widget?.update { widget.myStatusBar?.updateWidget(CodyWidgetFactory.ID) }
    }

    private fun findWidget(project: Project): CodyStatusBarWidget? {
      val widget =
          WindowManager.getInstance().getStatusBar(project)?.getWidget(CodyWidgetFactory.ID)
      return if (widget is CodyStatusBarWidget) widget else null
    }
  }
}
