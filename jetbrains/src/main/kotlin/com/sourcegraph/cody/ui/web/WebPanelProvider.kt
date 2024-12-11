package com.sourcegraph.cody.ui.web

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorLocation
import com.intellij.openapi.fileEditor.FileEditorPolicy
import com.intellij.openapi.fileEditor.FileEditorProvider
import com.intellij.openapi.fileEditor.FileEditorState
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Key
import com.intellij.openapi.util.UserDataHolderBase
import com.intellij.openapi.vfs.VirtualFile
import java.beans.PropertyChangeListener
import javax.swing.JComponent
import javax.swing.JLabel

/// A FileEditor which presents a WebUIProxy. This editor implements Webview panels for JetBrains.
internal class WebPanelEditor(private val file: VirtualFile) : FileEditor {
  companion object {
    val WEB_UI_PROXY_KEY = Key.create<WebUIProxy>("WebUIProxy")

    var epoch = 0
  }

  val age = epoch++
  private val userData = UserDataHolderBase()

  override fun <T : Any?> getUserData(key: Key<T>): T? = userData.getUserData(key)

  override fun <T : Any?> putUserData(key: Key<T>, value: T?) = userData.putUserData(key, value)

  override fun dispose() {
    // TODO: Implement this
  }

  override fun getComponent(): JComponent =
      file.getUserData(WEB_UI_PROXY_KEY)?.component ?: JLabel("No WebView created.")

  override fun getPreferredFocusedComponent(): JComponent? = getComponent()

  override fun getName(): String = "Cody Web Panel"

  override fun getFile(): VirtualFile = file

  override fun setState(state: FileEditorState) {
    // TODO: Implement this.
  }

  override fun isModified(): Boolean = false

  override fun isValid(): Boolean = true

  override fun addPropertyChangeListener(listener: PropertyChangeListener) {
    // TODO: Do we need to implement this?
  }

  override fun removePropertyChangeListener(listener: PropertyChangeListener) {
    // TODO: Do we need to implement this?
  }

  override fun getCurrentLocation(): FileEditorLocation? = null
}

/// The editor provider for WebPanelEditors.
class WebPanelProvider : FileEditorProvider, DumbAware {
  @Volatile private var scheduledForDisposal: VirtualFile? = null

  override fun accept(project: Project, file: VirtualFile): Boolean =
      file.fileType == WebPanelFileType.INSTANCE

  private fun runScheduledDisposal() {
    scheduledForDisposal?.getUserData(WebPanelEditor.WEB_UI_PROXY_KEY)?.dispose()
  }

  override fun createEditor(project: Project, file: VirtualFile): FileEditor {
    ApplicationManager.getApplication().assertIsDispatchThread()

    // If file was reopened we don't want to dispose WebView, as it means panel was just moved
    // between editors
    if (scheduledForDisposal != file) runScheduledDisposal()
    scheduledForDisposal = null

    return WebPanelEditor(file)
  }

  override fun disposeEditor(editor: FileEditor) {
    runScheduledDisposal()
    scheduledForDisposal = editor.file
  }

  // TODO: Implement readState, writeState if we need this to manage, restore.
  /*
    override fun readState(sourceElement: Element, project: Project, file: VirtualFile): FileEditorState {
      return super<FileEditorProvider>.readState(sourceElement, project, file)
    }

    override fun writeState(state: FileEditorState, project: Project, targetElement: Element) {
      super<FileEditorProvider>.writeState(state, project, targetElement)
    }
  */

  override fun getEditorTypeId(): String {
    return "CODY_WEB_PANEL"
  }

  override fun getPolicy(): FileEditorPolicy = FileEditorPolicy.HIDE_DEFAULT_EDITOR
}
