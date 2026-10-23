package expo.modules.looprun

import android.content.Context
import androidx.work.*
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.util.concurrent.TimeUnit

object LocalRuns {
  @Volatile private var instance: RunDatabase? = null
  fun get(context: Context): RunDatabase = instance ?: synchronized(this) {
    instance ?: RunDatabase(context.applicationContext).also { instance = it }
  }
}
class ApiFailure(val status: Int, message: String) : Exception(message)

object Uploader {
  fun validateBase(value: String): String {
    val base = value.trim().trimEnd('/'); val uri = URI(base)
    require(uri.userInfo == null && uri.rawQuery == null && uri.fragment == null && uri.host != null && (uri.path.isNullOrEmpty() || uri.path == "/")) { "请填写服务器根地址，不包含账户、路径或查询参数" }
    val host = uri.host.lowercase()
    val octets = host.split('.').mapNotNull { it.toIntOrNull() }
    val localIp = octets.joinToString(".") == host && octets.size == 4 && octets.all { it in 0..255 } &&
      (octets[0] == 127 || octets[0] == 10 || (octets[0] == 192 && octets[1] == 168) || (octets[0] == 172 && octets[1] in 16..31))
    val local = host == "localhost" || localIp
    require(uri.scheme.lowercase() == "https" || (uri.scheme.lowercase() == "http" && local)) { "远程内测服务器需要 HTTPS；HTTP 仅用于本机或局域网联调" }
    return base
  }
  private fun post(base: String, token: String, path: String, body: JSONObject): JSONObject {
    val connection = URL(base + "/api" + path).openConnection() as HttpURLConnection
    try {
      connection.requestMethod = "POST"; connection.connectTimeout = 10000; connection.readTimeout = 15000
      connection.instanceFollowRedirects = false; connection.doOutput = true
      connection.setRequestProperty("Content-Type", "application/json"); connection.setRequestProperty("Authorization", "Bearer $token")
      connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
      val status = connection.responseCode
      val text = (if (status in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: "{}"
      val result = try { JSONObject(text) } catch (_: Exception) { JSONObject() }
      if (status !in 200..299) throw ApiFailure(status, result.optString("error", "服务器暂时无法处理请求 ($status)"))
      return result
    } finally { connection.disconnect() }
  }
  @Synchronized fun sync(context: Context) {
    val db = LocalRuns.get(context); val run = db.current() ?: return
    val id = run.getString("id"); val vault = Vault(context); val token = vault.get("token"); val base = vault.get("server")
    if (token.isEmpty() || base.isEmpty()) return
    try {
      if (run.getString("status") == "cancel_pending") {
        val result = post(base, token, "/runs/$id/cancel", JSONObject()); db.complete(id, result.optJSONObject("report")); return
      }
      if (run.getString("status") in listOf("needs_action", "interrupted")) return
      var ack = run.getInt("acked")
      for (batchIndex in 0 until 30) {
        val batch = db.route(id, ack, 200)
        if (batch.length() == 0) break
        val result = post(base, token, "/runs/$id/points", JSONObject().put("points", batch))
        val next = result.getInt("acceptedThrough")
        check(next > ack && next <= db.count(id)) { "服务器采样确认序号无效" }
        ack = next; db.ack(id, ack)
      }
      val fresh = db.current() ?: return
      if (fresh.getString("id") != id) return
      if (fresh.getString("status") == "pending" && ack == db.count(id)) {
        val count = db.count(id)
        if (count == 0) { db.setError(id, "没有有效定位点，无法结算；可以放弃本次活动", true); return }
        val report = post(base, token, "/runs/$id/finish", JSONObject().put("endedAt", fresh.getLong("ended")).put("pointCount", count))
        db.complete(id, report)
      } else if (fresh.getString("status") == "recording" && fresh.getInt("share") == 1) {
        val count = db.count(id); val last = db.route(id, maxOf(0, count - 1), 1).optJSONObject(0)
        if (last != null && System.currentTimeMillis() + fresh.getLong("offset_ms") - last.getLong("time") < 20000)
          post(base, token, "/live", JSONObject().put("activityId", id).put("lat", last.getDouble("lat")).put("lng", last.getDouble("lng")).put("share", true))
      }
    } catch (e: ApiFailure) {
      db.setError(id, if (e.status == 401) "登录已失效，请重新连接内测账户；轨迹仍保存在本机" else e.message ?: "上传失败", run.getString("status") == "pending" && e.status in 400..499 && e.status !in listOf(401,409,429))
      throw e
    } catch (e: Exception) {
      db.setError(id, "暂时无法上传，轨迹已保存在本机，联网后重试")
      throw e
    }
  }
  fun schedule(context: Context) {
    val work = OneTimeWorkRequestBuilder<RunUploadWorker>()
      .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
      .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS).build()
    WorkManager.getInstance(context).enqueueUniqueWork("looprun-pending-upload", ExistingWorkPolicy.REPLACE, work)
  }
}
class RunUploadWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result = try { Uploader.sync(applicationContext); Result.success() }
  catch (e: ApiFailure) { if (e.status in 400..499 && e.status !in listOf(409,429)) Result.failure() else Result.retry() }
  catch (_: Exception) { Result.retry() }
}
