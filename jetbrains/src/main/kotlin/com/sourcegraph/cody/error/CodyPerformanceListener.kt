package com.sourcegraph.cody.error

import com.intellij.diagnostic.PerformanceListener
import com.intellij.diagnostic.ThreadDump
import java.nio.file.Path

class CodyPerformanceListener : PerformanceListener {
  override fun dumpedThreads(toFile: Path, dump: ThreadDump) {
    val isCodyStacktrace =
        dump.edtStackTrace?.any { it.className.startsWith("com.sourcegraph") } == true

    if (isCodyStacktrace) {
      val throwable = Throwable("IDE UI freeze detected").apply { stackTrace = dump.edtStackTrace }
      SentryService.getInstance().report(throwable)
    }
  }
}
