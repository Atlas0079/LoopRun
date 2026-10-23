package expo.modules.looprun

import android.Manifest
import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.*
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class RunService : Service(), LocationListener {
  companion object { @Volatile var alive = false }
  private lateinit var manager: LocationManager
  private val uploader = Executors.newSingleThreadScheduledExecutor()
  private val db by lazy { LocalRuns.get(this) }
  private fun notification(): Notification {
    val run = db.current(); val distance = run?.optDouble("distance", 0.0) ?: 0.0
    val launch = packageManager.getLaunchIntentForPackage(packageName) ?: Intent()
    val pending = PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    return NotificationCompat.Builder(this, "running")
      .setSmallIcon(R.drawable.ic_run_status).setContentTitle("圈界正在记录跑步")
      .setContentText("已记录 %.2f km · 锁屏后继续保存".format(distance / 1000))
      .setContentIntent(pending).setOngoing(true).setSilent(true).setCategory(NotificationCompat.CATEGORY_SERVICE).build()
  }
  override fun onCreate() {
    super.onCreate(); alive = true
    if (Build.VERSION.SDK_INT >= 26) {
      val channel = NotificationChannel("running", "跑步记录", NotificationManager.IMPORTANCE_LOW)
      getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
    try { ServiceCompat.startForeground(this, 71, notification(), if (Build.VERSION.SDK_INT >= 29) ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION else 0) }
    catch (_: RuntimeException) { db.current()?.optString("id")?.let { db.setError(it, "系统未允许前台定位服务，请检查权限后重新开始") }; stopSelf(); return }
    manager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
    uploader.scheduleWithFixedDelay({ try { Uploader.sync(this) } catch (_: Exception) {} }, 5, 15, TimeUnit.SECONDS)
  }
  @Suppress("MissingPermission")
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val run = db.current()
    if (run?.optString("status") != "recording" || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
      run?.optString("id")?.let { db.setError(it, "未获得精确定位权限，记录服务已停止") }; stopSelf(); return START_NOT_STICKY
    }
    try {
      var enabled = false
      for (provider in listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)) if (manager.isProviderEnabled(provider)) {
        manager.requestLocationUpdates(provider, 3000L, 3f, this, Looper.getMainLooper()); enabled = true
      }
      if (!enabled) { db.setError(run.getString("id"), "系统定位未开启，请开启后重新开始跑步"); stopSelf() }
    } catch (_: Exception) { db.setError(run.getString("id"), "系统暂时无法开启定位，记录服务已停止"); stopSelf() }
    return START_NOT_STICKY
  }
  override fun onLocationChanged(location: Location) {
    try {
      if (db.append(location) && (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED))
        getSystemService(NotificationManager::class.java).notify(71, notification())
    } catch (_: Exception) {
      db.current()?.optString("id")?.let { db.setError(it, "本机轨迹写入失败，请结束并检查存储空间") }; stopSelf()
    }
  }
  override fun onProviderDisabled(provider: String) { db.current()?.optString("id")?.let { db.setError(it, "定位信号暂时中断，请检查系统定位设置") } }
  override fun onBind(intent: Intent?) = null
  override fun onDestroy() {
    if (::manager.isInitialized) manager.removeUpdates(this)
    uploader.shutdownNow(); alive = false; db.interrupted()
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }
}
