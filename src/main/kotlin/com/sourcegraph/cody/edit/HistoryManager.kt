package com.sourcegraph.cody.edit

/** Manages user prompt history in memory for a session (project lifetime). */
class HistoryManager<T>(private val capacity: Int) {
  private val history = mutableListOf<T>()
  private var currentIndex = -1

  fun add(item: T) {
    history.remove(item) // avoid duplicates

    history.add(item) // new items go at the end

    if (history.size > capacity) {
      history.removeAt(0)
    }

    currentIndex = history.size - 1
  }

  fun getPrevious(): T? {
    if (currentIndex > 0) {
      currentIndex--
      return history[currentIndex]
    }
    return null
  }

  fun getNext(): T? {
    if (currentIndex < history.size - 1) {
      currentIndex++
      return history[currentIndex]
    }
    return null
  }

  fun isNotEmpty() = history.isNotEmpty()
}
