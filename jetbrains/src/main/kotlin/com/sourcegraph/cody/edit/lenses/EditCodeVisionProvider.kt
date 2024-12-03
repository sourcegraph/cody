package com.sourcegraph.cody.edit.lenses

import com.intellij.codeInsight.codeVision.CodeVisionAnchorKind
import com.intellij.codeInsight.codeVision.CodeVisionProvider
import com.intellij.codeInsight.codeVision.CodeVisionRelativeOrdering
import com.intellij.codeInsight.codeVision.CodeVisionState
import com.intellij.codeInsight.codeVision.CodeVisionState.Companion.READY_EMPTY
import com.intellij.codeInsight.codeVision.ui.model.ClickableRichTextCodeVisionEntry
import com.intellij.codeInsight.codeVision.ui.model.richText.RichText
import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.keymap.KeymapManager
import com.intellij.openapi.keymap.KeymapUtil
import com.intellij.openapi.project.DumbAware
import com.intellij.ui.JBColor
import com.intellij.ui.SimpleTextAttributes
import com.sourcegraph.cody.Icons
import com.sourcegraph.cody.agent.protocol_generated.ProtocolCommand
import com.sourcegraph.cody.edit.lenses.actions.LensEditAction.Companion.TASK_ID_KEY
import com.sourcegraph.cody.edit.lenses.providers.EditAcceptCodeVisionProvider
import com.sourcegraph.cody.edit.lenses.providers.EditCancelCodeVisionProvider
import com.sourcegraph.cody.edit.lenses.providers.EditDiffCodeVisionProvider
import com.sourcegraph.cody.edit.lenses.providers.EditRetryCodeVisionProvider
import com.sourcegraph.cody.edit.lenses.providers.EditUndoCodeVisionProvider
import com.sourcegraph.cody.edit.lenses.providers.EditWorkingCodeVisionProvider
import com.sourcegraph.utils.CodyEditorUtil
import java.awt.event.MouseEvent
import javax.swing.Icon

abstract class EditCodeVisionProviderMetadata {
  abstract val ordering: CodeVisionRelativeOrdering
  abstract val command: String
  open val textColor: JBColor = JBColor.BLACK

  val id: String
    get() = "EditCodeVisionProvider-${command}"

  fun showAfter(providerCompanion: EditCodeVisionProviderMetadata): CodeVisionRelativeOrdering {
    return CodeVisionRelativeOrdering.CodeVisionRelativeOrderingAfter(providerCompanion.id)
  }
}

abstract class EditCodeVisionProvider(private val metadata: EditCodeVisionProviderMetadata) :
    CodeVisionProvider<Unit>, DumbAware {
  override val id: String = metadata.id
  override val groupId: String = "EditCodeVisionProvider"
  override val name: String = "Cody Edit Lenses"
  override val defaultAnchor: CodeVisionAnchorKind = CodeVisionAnchorKind.Top
  override val relativeOrderings: List<CodeVisionRelativeOrdering> = listOf(metadata.ordering)

  override fun precomputeOnUiThread(editor: Editor) {}

  private fun getIcon(iconId: String): Icon? {
    return when (iconId) {
      "$(cody-logo)" -> Icons.StatusBar.CodyAvailable
      "$(sync~spin)" -> Icons.StatusBar.CompletionInProgress
      "$(warning)" -> AllIcons.General.Warning
      else -> null
    }
  }

  private fun getActionRichText(cmd: ProtocolCommand): RichText {
    return RichText().also {
      it.append(
          cmd.title.text, SimpleTextAttributes(SimpleTextAttributes.STYLE_BOLD, metadata.textColor))

      val shortcuts = KeymapManager.getInstance().activeKeymap.getShortcuts(cmd.command)
      shortcuts.firstOrNull()?.let { shortcut ->
        val hotkey = KeymapUtil.getShortcutText(shortcut)
        it.append(" $hotkey", SimpleTextAttributes(SimpleTextAttributes.STYLE_PLAIN, JBColor.GRAY))
      }

      it.append("   |", SimpleTextAttributes(SimpleTextAttributes.STYLE_PLAIN, JBColor.GRAY))
    }
  }

  override fun computeCodeVision(editor: Editor, uiData: Unit): CodeVisionState {
    return runReadAction {
      val project = editor.project ?: return@runReadAction READY_EMPTY

      val codeVisionEntries =
          LensesService.getInstance(project).getLenses(editor).mapNotNull { codeLens ->
            val cmd = codeLens.command
            if (cmd == null || cmd.command != metadata.command) null
            else {
              val richText = getActionRichText(cmd)
              val icon = cmd.title.icons.firstOrNull()?.value?.let { getIcon(it) }
              val textRange = CodyEditorUtil.getTextRange(editor.document, codeLens.range)
              val onClick = { event: MouseEvent?, editor: Editor ->
                triggerAction(cmd, event, editor)
              }
              val entry =
                  ClickableRichTextCodeVisionEntry(
                      id, richText, onClick, icon, "", richText.text, emptyList())
              textRange to entry
            }
          }

      return@runReadAction CodeVisionState.Ready(codeVisionEntries)
    }
  }

  private fun createDataContext(editor: Editor, taskId: String?): DataContext {
    return DataContext { dataId ->
      when (dataId) {
        PlatformDataKeys.CONTEXT_COMPONENT.name -> this
        PlatformDataKeys.EDITOR.name -> editor
        PlatformDataKeys.PROJECT.name -> editor.project
        TASK_ID_KEY.name -> taskId
        else -> null
      }
    }
  }

  private fun triggerAction(cmd: ProtocolCommand, event: MouseEvent?, editor: Editor) {
    val action = ActionManager.getInstance().getAction(cmd.command)
    if (action != null) {
      val taskId = (cmd.arguments?.firstOrNull() as com.google.gson.JsonPrimitive).asString
      val dataContext = createDataContext(editor, taskId)
      val actionEvent =
          AnActionEvent(
              event,
              dataContext,
              ActionPlaces.EDITOR_INLAY,
              action.templatePresentation.clone(),
              ActionManager.getInstance(),
              0)
      action.actionPerformed(actionEvent)
    }
  }

  companion object {
    fun allEditProviders(): List<EditCodeVisionProviderMetadata> {
      return listOf(
          EditAcceptCodeVisionProvider,
          EditCancelCodeVisionProvider,
          EditDiffCodeVisionProvider,
          EditWorkingCodeVisionProvider,
          EditRetryCodeVisionProvider,
          EditUndoCodeVisionProvider)
    }
  }
}
