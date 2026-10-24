package expo.modules.looprun

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LoopRunNativeModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext) { "App 尚未准备好" }
  override fun definition() = ModuleDefinition {
    Name("LoopRunNative")
    OnActivityEntersForeground { LoopRunMapView.resumeAll() }
    OnActivityEntersBackground { LoopRunMapView.pauseAll() }
    OnActivityDestroys { LoopRunMapView.destroyAll() }
    View(LoopRunMapView::class) {
      Events("onRegionChange", "onCellPress", "onMapStatus", "onRunnerPress")
      Prop("scene") { view: LoopRunMapView, scene: String -> view.updateScene(scene) }
      OnViewDestroys { view: LoopRunMapView -> view.dispose() }
    }
    Function("validateServer") { base: String -> Uploader.validateBase(base) }
    OnCreate { if (!RunService.alive) LocalRuns.get(context).interrupted() }
    Function("configuration") {
      val vault = Vault(context)
      mapOf("server" to vault.profile("server"), "token" to vault.profile("token"), "installSecret" to vault.installSecret(), "privacy" to vault.get("privacy-amap"), "developerMode" to vault.developerMode())
    }
    AsyncFunction("acceptPrivacy") { Vault(context).put("privacy-amap", "accepted") }
    AsyncFunction("configure") { base: String, token: String ->
      synchronized(Uploader) {
        val normalized = Uploader.validateBase(base); val vault = Vault(context)
        check(LocalRuns.get(context).current() == null || normalized == vault.profile("server")) { "本机有未处理轨迹，不能切换到其他服务器" }
        vault.putProfile("server", normalized); vault.putProfile("token", token); Uploader.schedule(context)
      }
    }
    AsyncFunction("setDeveloperMode") { enabled: Boolean ->
      synchronized(Uploader) {
        check(LocalRuns.get(context).current() == null) { "请先结束、上传或放弃本机活动，再切换开发者模式" }
        Vault(context).put("developer-mode", if (enabled) "enabled" else "disabled")
      }
    }
    AsyncFunction("begin") { id: String, started: Double, offset: Double, share: Boolean ->
      check(appContext.currentActivity != null) { "请从前台页面开始跑步" }
      check(ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) { "跑步记录需要精确定位权限" }
      LocalRuns.get(context).create(id, started.toLong(), offset.toLong(), share)
      try { RunService.alive = true; ContextCompat.startForegroundService(context, Intent(context, RunService::class.java)) }
      catch (e: Exception) { RunService.alive = false; LocalRuns.get(context).interrupted(); throw e }
    }
    AsyncFunction("stop") {
      LocalRuns.get(context).stop(); context.stopService(Intent(context, RunService::class.java)); Uploader.schedule(context)
    }
    AsyncFunction("discard") {
      LocalRuns.get(context).stop(true); context.stopService(Intent(context, RunService::class.java)); Uploader.schedule(context)
    }
    AsyncFunction("snapshot") { LocalRuns.get(context).snapshot() }
    AsyncFunction("sync") { Uploader.sync(context); LocalRuns.get(context).snapshot() }
  }
}
