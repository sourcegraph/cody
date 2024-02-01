package com.sourcegraph.cody.history.node

import javax.swing.tree.DefaultMutableTreeNode

class RootNode : DefaultMutableTreeNode(null, true) {

  fun periods(): List<PeriodNode> = children().toList().filterIsInstance<PeriodNode>()
}
