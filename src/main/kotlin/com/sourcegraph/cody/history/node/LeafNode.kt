package com.sourcegraph.cody.history.node

import com.sourcegraph.cody.history.state.ChatState
import javax.swing.tree.DefaultMutableTreeNode

class LeafNode(val chat: ChatState) : DefaultMutableTreeNode(chat, false) {

  fun title() = chat.title() ?: "No title"

}
