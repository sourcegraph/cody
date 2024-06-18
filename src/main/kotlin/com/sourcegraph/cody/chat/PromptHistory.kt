package com.sourcegraph.cody.chat

open class PromptHistory(private val capacity: Int) {
  private val history = mutableListOf<String>()
  private var currentIndex = 0

  fun add(item: String) {
    history.add(item)
    if (history.size > capacity) {
      history.removeAt(0)
    }
    resetHistory()
  }

  fun getPrevious(): String? {
    if (currentIndex > 0) {
      currentIndex--
    }
    return history.getOrNull(currentIndex)
  }

  fun getNext(): String? {
    if (currentIndex < history.size) {
      currentIndex++
    }
    return history.getOrNull(currentIndex)
  }

  fun isNotEmpty() = history.isNotEmpty()

  fun resetHistory() {
    currentIndex = history.size
  }
}
