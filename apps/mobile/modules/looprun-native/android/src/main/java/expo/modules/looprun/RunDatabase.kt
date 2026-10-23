package expo.modules.looprun

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.location.Location
import org.json.JSONArray
import org.json.JSONObject

class RunDatabase(context: Context) : SQLiteOpenHelper(context.applicationContext, "looprun-gps.db", null, 1) {
  init { setWriteAheadLoggingEnabled(true) }
  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL("CREATE TABLE runs(id TEXT PRIMARY KEY,started INTEGER NOT NULL,offset_ms INTEGER NOT NULL,share INTEGER NOT NULL,status TEXT NOT NULL,ended INTEGER,acked INTEGER NOT NULL DEFAULT 0,distance REAL NOT NULL DEFAULT 0,max_gap INTEGER NOT NULL DEFAULT 0,error TEXT NOT NULL DEFAULT '',report TEXT)")
    db.execSQL("CREATE TABLE samples(run_id TEXT NOT NULL,seq INTEGER NOT NULL,lat REAL NOT NULL,lng REAL NOT NULL,time INTEGER NOT NULL,accuracy REAL NOT NULL,PRIMARY KEY(run_id,seq))")
  }
  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) { error("本机数据结构不匹配，请保留数据并联系内测维护者") }
  @Synchronized fun current(): JSONObject? = readableDatabase.rawQuery("SELECT * FROM runs WHERE status NOT IN ('settled','cancelled') ORDER BY started DESC LIMIT 1", null).use { c ->
    if (!c.moveToFirst()) null else JSONObject().apply {
      for (i in 0 until c.columnCount) put(c.getColumnName(i), when (c.getType(i)) { 0 -> JSONObject.NULL; 1 -> c.getLong(i); 2 -> c.getDouble(i); else -> c.getString(i) })
    }
  }
  @Synchronized fun create(id: String, started: Long, offset: Long, share: Boolean) {
    check(current() == null) { "请先结束、上传或放弃上一场跑步" }
    writableDatabase.insertOrThrow("runs", null, ContentValues().apply { put("id", id); put("started", started); put("offset_ms", offset); put("share", if (share) 1 else 0); put("status", "recording") })
  }
  @Synchronized fun route(id: String, after: Int = 0, limit: Int = 6000): JSONArray {
    val result = JSONArray()
    readableDatabase.rawQuery("SELECT seq,lat,lng,time,accuracy FROM samples WHERE run_id=? AND seq>? ORDER BY seq LIMIT ?", arrayOf(id, after.toString(), limit.toString())).use { c ->
      while (c.moveToNext()) result.put(JSONObject().put("seq", c.getInt(0)).put("lat", c.getDouble(1)).put("lng", c.getDouble(2)).put("time", c.getLong(3)).put("accuracy", c.getDouble(4)))
    }
    return result
  }
  @Synchronized fun count(id: String): Int = readableDatabase.rawQuery("SELECT COUNT(*) FROM samples WHERE run_id=?", arrayOf(id)).use { c -> c.moveToFirst(); c.getInt(0) }
  @Synchronized fun append(location: Location): Boolean {
    val run = current() ?: return false
    if (run.getString("status") != "recording" || !location.hasAccuracy() || location.accuracy > 80 || !location.latitude.isFinite() || !location.longitude.isFinite()) return false
    val id = run.getString("id"); val n = count(id)
    if (n >= 6000) { setError(id, "已达到 6000 个采样点，请结束并上传"); return false }
    val time = location.time + run.getLong("offset_ms")
    if (time < run.getLong("started")) return false
    val last = route(id, maxOf(0, n - 1), 1).optJSONObject(0)
    if (last != null && time - last.getLong("time") < 1500) return false
    var distance = run.getDouble("distance"); var maxGap = run.getLong("max_gap")
    if (last != null) {
      val meters = FloatArray(1); Location.distanceBetween(last.getDouble("lat"), last.getDouble("lng"), location.latitude, location.longitude, meters)
      distance += meters[0]; maxGap = maxOf(maxGap, time - last.getLong("time"))
    }
    val db = writableDatabase; db.beginTransaction()
    try {
      db.insertOrThrow("samples", null, ContentValues().apply { put("run_id", id); put("seq", n + 1); put("lat", location.latitude); put("lng", location.longitude); put("time", time); put("accuracy", location.accuracy.toDouble()) })
      db.update("runs", ContentValues().apply { put("distance", distance); put("max_gap", maxGap) }, "id=?", arrayOf(id)); db.setTransactionSuccessful()
    } finally { db.endTransaction() }
    return true
  }
  @Synchronized fun stop(cancel: Boolean = false) {
    val run = current() ?: return
    writableDatabase.update("runs", ContentValues().apply {
      put("status", if (cancel) "cancel_pending" else "pending")
      if (run.isNull("ended")) put("ended", System.currentTimeMillis() + run.getLong("offset_ms"))
      put("error", "")
    }, "id=?", arrayOf(run.getString("id")))
  }
  @Synchronized fun interrupted() {
    val run = current() ?: return
    if (run.getString("status") == "recording") writableDatabase.execSQL("UPDATE runs SET status='interrupted',error='记录服务已中断，不能自动补录缺失轨迹' WHERE id=?", arrayOf(run.getString("id")))
  }
  @Synchronized fun ack(id: String, seq: Int) { writableDatabase.execSQL("UPDATE runs SET acked=MAX(acked,?),error='' WHERE id=?", arrayOf(seq, id)) }
  @Synchronized fun setError(id: String, message: String, action: Boolean = false) {
    val values = ContentValues().apply { put("error", message.take(300)); if (action) put("status", "needs_action") }
    writableDatabase.update("runs", values, "id=?", arrayOf(id))
  }
  @Synchronized fun complete(id: String, report: JSONObject?) {
    writableDatabase.update("runs", ContentValues().apply { put("status", if (report == null) "cancelled" else "settled"); put("error", ""); if (report != null) put("report", report.toString()) }, "id=?", arrayOf(id))
  }
  @Synchronized fun snapshot(): String {
    val run = current(); val result = JSONObject()
    if (run != null) {
      val points = route(run.getString("id")); run.put("pointCount", points.length()); run.put("route", points)
      result.put("run", run)
    }
    readableDatabase.rawQuery("SELECT id,report FROM runs WHERE status='settled' ORDER BY started DESC LIMIT 1", null).use { c -> if (c.moveToFirst()) result.put("report", JSONObject(c.getString(1))).put("reportId", c.getString(0)) }
    return result.toString()
  }
}
