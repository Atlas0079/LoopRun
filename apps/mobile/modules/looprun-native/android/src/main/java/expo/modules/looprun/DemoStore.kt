package expo.modules.looprun

import android.content.Context
import android.util.AtomicFile
import java.io.File

object DemoStore {
  private fun file(context: Context) = AtomicFile(File(context.filesDir, "looprun-demo.json"))
  @Synchronized fun read(context: Context): String {
    val store = file(context)
    if (!store.baseFile.exists() && !File(store.baseFile.path + ".bak").exists()) return ""
    return store.openRead().bufferedReader(Charsets.UTF_8).use { it.readText() }
  }
  @Synchronized fun write(context: Context, value: String) {
    val store = file(context)
    val stream = store.startWrite()
    try { stream.write(value.toByteArray(Charsets.UTF_8)); store.finishWrite(stream) }
    catch (error: Exception) { store.failWrite(stream); throw error }
  }
}
