package com.sourcegraph.cody.ui

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.*
import com.intellij.openapi.fileEditor.ex.FileEditorManagerEx
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Key
import com.intellij.openapi.util.UserDataHolderBase
import com.intellij.openapi.vfs.VirtualFile
import java.beans.PropertyChangeListener
import javax.swing.JComponent
import javax.swing.JLabel
import org.jetbrains.annotations.NonNls

class WebPanelEditor(private val file: VirtualFile) : FileEditor {
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

class WebPanelProvider : FileEditorProvider, DumbAware {
  private var creatingEditor = 0

  override fun accept(project: Project, file: VirtualFile): Boolean =
      file.fileType == WebPanelFileType.INSTANCE

  override fun createEditor(project: Project, file: VirtualFile): FileEditor {
    ApplicationManager.getApplication().assertIsDispatchThread()
    try {
      this.creatingEditor++
      // If this file is already open elsewhere, close it.
      (FileEditorManager.getInstance(project) as? FileEditorManagerEx)?.closeFile(file)
      return WebPanelEditor(file)
    } finally {
      this.creatingEditor--
    }
  }

  override fun disposeEditor(editor: FileEditor) {
    ApplicationManager.getApplication().assertIsDispatchThread()
    if (this.creatingEditor > 0) {
      // We are synchronously creating an editor, which means we do not want to dispose the webview:
      // It will be
      // adopted by the new editor.
      return
    }
    editor.file.getUserData(WebPanelEditor.WEB_UI_PROXY_KEY)?.let { it.dispose() }
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

  override fun getEditorTypeId(): @NonNls String {
    return "CODY_WEB_PANEL"
  }

  override fun getPolicy(): FileEditorPolicy = FileEditorPolicy.HIDE_DEFAULT_EDITOR
}
