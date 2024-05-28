package com.sourcegraph.cody.context.ui

import com.intellij.openapi.project.Project
import com.intellij.ui.CheckedTreeNode
import com.sourcegraph.cody.context.RemoteRepo
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

/** Enterprise context selector tree, root node. */
open class ContextTreeEnterpriseRootNode(var numActiveRepos: Int, onSetChecked: (Boolean) -> Unit) :
    ContextTreeNode<Any>(
        Object(), onSetChecked) // TreePaths depend on user objects; Object() ensures uniqueness.

// TODO: Can we remove onActivate if we remove the toolbar?
/** Enterprise context selector tree, a node to trigger editing the repository list. */
class ContextTreeEditReposNode(var hasRemovableRepos: Boolean, val onActivate: () -> Unit) :
    ContextTreeNode<Any>(Object())

/** Enterprise context selector tree, a specific remote repository. */
class ContextTreeRemoteRepoNode(val repo: RemoteRepo, onSetChecked: (Boolean) -> Unit) :
    ContextTreeNode<Any>(
        Object(), onSetChecked) // TreePaths depend on user objects; Object() ensures uniqueness.
