package com.sourcegraph.cody.history.node

import javax.swing.tree.DefaultMutableTreeNode

class PeriodNode(val periodText: String) : DefaultMutableTreeNode(periodText, true) {

  fun leafs(): List<LeafNode> = children().toList().filterIsInstance<LeafNode>()
}
