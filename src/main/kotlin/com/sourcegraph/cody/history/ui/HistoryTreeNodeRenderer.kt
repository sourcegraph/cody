package com.sourcegraph.cody.history.ui

import com.intellij.ide.util.treeView.NodeRenderer
import com.intellij.ui.SimpleTextAttributes
import com.sourcegraph.cody.Icons
import com.sourcegraph.cody.history.node.LeafNode
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.CodyBundle.fmt
import java.time.LocalDateTime
import java.time.temporal.ChronoUnit
import javax.swing.JTree

class HistoryTreeNodeRenderer : NodeRenderer() {

  override fun customizeCellRenderer(
      tree: JTree,
      value: Any?,
      selected: Boolean,
      expanded: Boolean,
      leaf: Boolean,
      row: Int,
      hasFocus: Boolean
  ) {
    when (value) {
      is LeafNode -> {
        icon = Icons.Chat.ChatLeaf
        append(" ")
        append(value.title())
        append(" ")

        val lastUpdated = value.chat.getUpdatedTimeAt()
        if (isShortDuration(lastUpdated)) {
          append(" ")
          val duration = DurationUnitFormatter.format(lastUpdated)
          append(
              CodyBundle.getString("duration.x-ago").fmt(duration),
              SimpleTextAttributes.GRAYED_ATTRIBUTES)
        }
      }
      else -> append(value.toString())
    }
  }

  private fun isShortDuration(since: LocalDateTime) =
      ChronoUnit.DAYS.between(since, LocalDateTime.now()).toInt() < 7
}
