package com.sourcegraph.cody.context.ui

import com.intellij.openapi.project.Project
import com.intellij.ui.CheckedTreeNode
import com.sourcegraph.vcs.CodebaseName
import java.util.concurrent.atomic.AtomicBoolean

open class ContextTreeNode<T>(value: T, private val onSetChecked: (Boolean) -> Unit = {}) :
    CheckedTreeNode(value) {
  override fun setChecked(checked: Boolean) {
    super.setChecked(checked)
    onSetChecked(checked)
  }
}

class ContextTreeRootNode(val text: String, onSetChecked: (Boolean) -> Unit) :
    ContextTreeNode<String>(text, onSetChecked)

class ContextTreeRemoteRootNode(val text: String) : ContextTreeNode<String>(text)

class ContextTreeRemoteRepoNode(val codebaseName: CodebaseName, onSetChecked: (Boolean) -> Unit) :
    ContextTreeNode<CodebaseName>(codebaseName, onSetChecked)

open class ContextTreeLocalNode<T>(value: T, private val isEnhancedContextEnabled: AtomicBoolean) :
    ContextTreeNode<T>(value) {
  init {
    this.isEnabled = false
  }

  override fun isChecked(): Boolean = isEnhancedContextEnabled.get()
}

class ContextTreeLocalRootNode(val text: String, isEnhancedContextEnabled: AtomicBoolean) :
    ContextTreeLocalNode<String>(text, isEnhancedContextEnabled)

class ContextTreeLocalRepoNode(val project: Project, isEnhancedContextEnabled: AtomicBoolean) :
    ContextTreeLocalNode<Project>(project, isEnhancedContextEnabled)
