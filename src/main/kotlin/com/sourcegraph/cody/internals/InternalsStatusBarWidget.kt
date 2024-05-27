package com.sourcegraph.cody.internals

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
import com.sourcegraph.cody.statusbar.CodyWidgetFactory

class InternalsStatusBarWidget(project: Project) : EditorBasedStatusBarPopup(project, false) {
  override fun ID(): String = CodyWidgetFactory.ID

  override fun getWidgetState(file: VirtualFile?): WidgetState {
    val state = WidgetState("Cody Internals", "Internals", true)
    return state
  }

  override fun createPopup(context: DataContext): ListPopup {
    val actionGroup =
        ActionManager.getInstance().getAction("InternalStatusBarActions") as? ActionGroup
            ?: InternalsStatusBarActionGroup()
    return JBPopupFactory.getInstance()
        .createActionGroupPopup(
            "Cody Internals",
            actionGroup,
            DataManager.getInstance().getDataContext(this.component),
            JBPopupFactory.ActionSelectionAid.SPEEDSEARCH,
            true)
  }

  override fun createInstance(project: Project): StatusBarWidget {
    return InternalsStatusBarWidget(project)
  }

  companion object {

    fun update(project: Project) {
      val widget: InternalsStatusBarWidget? = findWidget(project)
      widget?.update { widget.myStatusBar?.updateWidget(InternalsStatusBarWidgetFactory.ID) }
    }

    private fun findWidget(project: Project): InternalsStatusBarWidget? {
      val widget =
          WindowManager.getInstance()
              .getStatusBar(project)
              ?.getWidget(InternalsStatusBarWidgetFactory.ID)
      return if (widget is InternalsStatusBarWidget) widget else null
    }
  }
}
