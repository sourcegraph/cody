package com.sourcegraph.cody.edit

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.sourcegraph.cody.Icons
import com.sourcegraph.cody.agent.protocol_generated.ProtocolCodeLens
import com.sourcegraph.cody.edit.widget.LensAction
import com.sourcegraph.cody.edit.widget.LensHotkey
import com.sourcegraph.cody.edit.widget.LensIcon
import com.sourcegraph.cody.edit.widget.LensLabel
import com.sourcegraph.cody.edit.widget.LensSpinner
import com.sourcegraph.cody.edit.widget.LensWidgetGroup
import com.sourcegraph.utils.CodyEditorUtil
import java.awt.Point
import javax.swing.Icon

typealias Uri = String

typealias TaskId = String

interface LensListener {
  fun onLensesUpdate(lensWidgetGroup: LensWidgetGroup?, codeLenses: List<ProtocolCodeLens>)
}

@Service(Service.Level.PROJECT)
class LensesService(val project: Project) {
  private var lensGroups = mutableMapOf<Uri, Map<TaskId, LensWidgetGroup>>()

  private val listeners = mutableListOf<LensListener>()

  fun addListener(listener: LensListener) {
    listeners.add(listener)
  }

  fun removeListener(listener: LensListener) {
    listeners.remove(listener)
  }

  fun getTaskIdsOfFirstVisibleLens(editor: Editor): TaskId? {
    val visibleArea = editor.scrollingModel.visibleArea
    val visibleInlays =
        editor.inlayModel.getBlockElementsInRange(
            editor.visualPositionToOffset(editor.xyToVisualPosition(visibleArea.location)),
            editor.visualPositionToOffset(
                editor.xyToVisualPosition(
                    Point(visibleArea.x + visibleArea.width, visibleArea.y + visibleArea.height))))

    return lensGroups.values
        .flatMap { param -> param.toList() }
        .find { (_, lensGroup) -> visibleInlays.any { it == lensGroup.inlay } }
        ?.first
  }

  fun updateLenses(uri: String, codeLens: List<ProtocolCodeLens>) {
    runInEdt {
      val vf = CodyEditorUtil.findFileOrScratch(project, uri) ?: return@runInEdt
      val fileDesc = OpenFileDescriptor(project, vf)
      val editor =
          FileEditorManager.getInstance(project).openTextEditor(fileDesc, /* focusEditor = */ false)
              ?: return@runInEdt

      val ranges = codeLens.groupBy { it.range }.keys.sortedBy { it.start.line }
      ranges.zipWithNext { r1, r2 ->
        if (r1.end.line > r2.start.line)
            throw Exception("Lens ranges $r1 and $r2 for file $uri cannot overlap")
      }

      val newLensGroups =
          codeLens
              .groupBy { it.range }
              .map { (range, codeLensesModels) ->
                val taskId = codeLensesModels.firstNotNullOf { getTaskId(it) }
                taskId to (range to createLensGroup(editor, codeLensesModels))
              }
              .toMap()

      lensGroups[uri]?.values?.forEach { Disposer.dispose(it) }
      newLensGroups.forEach { (taskId, rangeAndLensGroup) ->
        val (range, lensGroup) = rangeAndLensGroup
        val isNewTask = !lensGroups.containsKey(taskId)
        lensGroup.show(range, shouldScrollToLens = isNewTask)
      }

      newLensGroups.forEach { (taskId, rangeAndLensGroup) ->
        val lenses = codeLens.filter { getTaskId(it) == taskId }
        listeners.forEach { it.onLensesUpdate(rangeAndLensGroup.second, lenses) }
      }
      if (newLensGroups.isEmpty()) {
        listeners.forEach { it.onLensesUpdate(null, emptyList()) }
      }

      lensGroups[uri] = newLensGroups.mapValues { it.value.second }
    }
  }

  private fun getTaskId(codeLens: ProtocolCodeLens): String? {
    return (codeLens.command?.arguments?.firstOrNull() as com.google.gson.JsonPrimitive).asString
  }

  private fun createLensGroup(editor: Editor, codeLens: List<ProtocolCodeLens>): LensWidgetGroup {
    return LensWidgetGroup(editor).apply {
      addLogo(this)

      codeLens.forEach { lens ->
        val title = lens.command?.title?.text
        val command = lens.command?.command
        if (title != null && command != null) {
          if (lens.command.title.icons.any { it.value == SPINNER_ICON }) {
            addSpinner(this)
          }

          if (command === FOCUS_COMMAND) {
            addLabel(this, title)
          } else {
            val taskId =
                (lens.command.arguments?.firstOrNull() as com.google.gson.JsonPrimitive).asString
            addAction(this, title, command, taskId)
          }

          addSeparator(this)
        }
      }
    }
  }

  private fun addSeparator(group: LensWidgetGroup) {
    group.addWidget(LensLabel(group, SEPARATOR))
  }

  private fun addLabel(
      group: LensWidgetGroup,
      label: String,
  ): LensLabel {
    return LensLabel(group, label).apply { group.addWidget(this) }
  }

  private fun addSpinner(group: LensWidgetGroup) {
    group.addWidget(LensSpinner(group, Icons.StatusBar.CompletionInProgress))
    addSpacer(group)
  }

  private fun addLogo(group: LensWidgetGroup) {
    addIcon(group, Icons.StatusBar.CodyAvailable)
  }

  private fun addSpacer(group: LensWidgetGroup) {
    addLabel(group, ICON_SPACER)
  }

  private fun addAction(group: LensWidgetGroup, label: String, actionId: String, taskId: String?) {
    group.addWidget(LensAction(group, label, actionId, taskId))

    val hotkey = EditCommandPrompt.getShortcutDisplayString(actionId)
    if (!hotkey.isNullOrEmpty()) {
      group.addWidget(LensHotkey(group, hotkey))
    }
  }

  private fun addErrorIcon(group: LensWidgetGroup) {
    addIcon(group, Icons.Edit.Error)
  }

  private fun addIcon(group: LensWidgetGroup, icon: Icon) {
    group.addWidget(LensIcon(group, icon))
    addSpacer(group)
  }

  companion object {
    private const val SPINNER_ICON = "$(sync~spin)"
    const val ICON_SPACER = " "
    const val SEPARATOR = " ∣ "
    const val FOCUS_COMMAND = "cody.chat.focus"

    fun getInstance(project: Project): LensesService {
      return project.service<LensesService>()
    }
  }
}
