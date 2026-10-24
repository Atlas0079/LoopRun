package expo.modules.looprun

import android.content.Context
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import com.amap.api.maps.AMap
import com.amap.api.maps.AMapOptions
import com.amap.api.maps.CameraUpdateFactory
import com.amap.api.maps.CoordinateConverter
import com.amap.api.maps.MapView
import com.amap.api.maps.MapsInitializer
import com.amap.api.maps.model.CameraPosition
import com.amap.api.maps.model.Circle
import com.amap.api.maps.model.CircleOptions
import com.amap.api.maps.model.LatLng
import com.amap.api.maps.model.LatLngBounds
import com.amap.api.maps.model.Polygon
import com.amap.api.maps.model.PolygonOptions
import com.amap.api.maps.model.Polyline
import com.amap.api.maps.model.PolylineOptions
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.abs

/** All incoming geometry and outgoing query bounds use WGS-84; only SDK rendering uses GCJ-02. */
class LoopRunMapView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  companion object {
    private val views = java.util.Collections.newSetFromMap(java.util.WeakHashMap<LoopRunMapView, Boolean>())
    fun resumeAll() { views.toList().forEach { it.onHostResume() } }
    fun pauseAll() { views.toList().forEach { it.onHostPause() } }
    fun destroyAll() { views.toList().forEach { it.dispose() } }
  }
  override val shouldUseAndroidLayout = true
  private val onRegionChange by EventDispatcher()
  private val onCellPress by EventDispatcher()
  private val onMapStatus by EventDispatcher()
  private val handler = Handler(Looper.getMainLooper())
  private var mapView: MapView? = null
  private var map: AMap? = null
  private var destroyed = false
  private var loaded = false
  private var lastScene = ""
  private var cameraId = ""
  private var cellsJson = ""
  private val polygons = mutableListOf<Polygon>()
  private val cellKeys = mutableMapOf<String, String>()
  private var route: Polyline? = null
  private var routeOutline: Polyline? = null
  private var position: Circle? = null
  private val converted = object : LinkedHashMap<LatLng, LatLng>(4096, .75f, true) {
    override fun removeEldestEntry(eldest: MutableMap.MutableEntry<LatLng, LatLng>?) = size > 30000
  }
  private val timeout = Runnable { if (!loaded && !destroyed) onMapStatus(mapOf("error" to "高德底图加载超时，请检查网络或地图 Key 配置后重试。")) }

  init {
    setBackgroundColor(Color.rgb(231, 238, 232))
    // Never construct the SDK before consent, including when a view is mounted outside the home page.
    if (Vault(context).get("privacy-amap") == "accepted") {
      try {
        MapsInitializer.updatePrivacyShow(context, true, true)
        MapsInitializer.updatePrivacyAgree(context, true)
        val view = MapView(context, AMapOptions().zoomControlsEnabled(true))
        mapView = view
        view.onCreate(Bundle())
        addView(view, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        val sdk = view.map
        map = sdk
        sdk.uiSettings.isZoomControlsEnabled = true
        sdk.uiSettings.zoomPosition = AMapOptions.ZOOM_POSITION_RIGHT_BOTTOM
        sdk.uiSettings.isScaleControlsEnabled = true
        sdk.uiSettings.isRotateGesturesEnabled = false
        sdk.uiSettings.isTiltGesturesEnabled = false
        sdk.setMinZoomLevel(12f)
        sdk.setMaxZoomLevel(19f)
        sdk.moveCamera(CameraUpdateFactory.newLatLngZoom(display(LatLng(31.2353, 121.4747)), 16f))
        sdk.setOnMapLoadedListener {
          sdk.uiSettings.isZoomControlsEnabled = true
          sdk.uiSettings.zoomPosition = AMapOptions.ZOOM_POSITION_RIGHT_BOTTOM
          loaded = true
          handler.removeCallbacks(timeout)
          onMapStatus(mapOf("error" to ""))
          if (lastScene.isNotEmpty()) render(JSONObject(lastScene))
          emitBounds()
        }
        sdk.setOnCameraChangeListener(object : AMap.OnCameraChangeListener {
          override fun onCameraChange(camera: CameraPosition?) = Unit
          override fun onCameraChangeFinish(camera: CameraPosition?) { emitBounds() }
        })
        sdk.setOnMapClickListener { point ->
          polygons.asReversed().firstOrNull { it.contains(point) }?.let { polygon ->
            cellKeys[polygon.id]?.let { onCellPress(mapOf("key" to it)) }
          }
        }
        views.add(this)
      } catch (error: Exception) {
        post { if (!destroyed) onMapStatus(mapOf("error" to (error.message ?: "地图初始化失败"))) }
      }
    } else post { if (!destroyed) onMapStatus(mapOf("error" to "请先阅读并确认高德地图与位置用途。")) }
  }

  private fun display(point: LatLng): LatLng = converted.getOrPut(point) {
    CoordinateConverter(context).from(CoordinateConverter.CoordType.GPS).coord(point).convert()
  }

  /** Numerically invert the SDK's own forward transform for viewport queries only.
   * Recorded points, grid geometry and settlement never pass through this inverse. */
  private fun queryPoint(point: LatLng): LatLng {
    var candidate = point
    repeat(12) {
      val projected = display(candidate)
      val dLat = point.latitude - projected.latitude
      val dLng = point.longitude - projected.longitude
      if (abs(dLat) < 1e-7 && abs(dLng) < 1e-7) return candidate
      candidate = LatLng(candidate.latitude + dLat, candidate.longitude + dLng)
    }
    check(abs(display(candidate).latitude - point.latitude) < 1e-6 && abs(display(candidate).longitude - point.longitude) < 1e-6) { "地图查询坐标转换失败，请移动地图后重试" }
    return candidate
  }

  private fun emitBounds() {
    if (!loaded || destroyed) return
    try {
      val visible = map!!.projection.visibleRegion
      val corners = listOf(visible.nearLeft, visible.nearRight, visible.farLeft, visible.farRight).map(::queryPoint)
      // Small padding includes hexagons whose centres lie immediately outside the visible edge.
      val bounds = listOf(corners.minOf { it.longitude } - .0005, corners.minOf { it.latitude } - .0005,
        corners.maxOf { it.longitude } + .0005, corners.maxOf { it.latitude } + .0005)
      onRegionChange(mapOf("bounds" to bounds))
    } catch (error: Exception) { onMapStatus(mapOf("error" to (error.message ?: "地图范围查询失败"))) }
  }

  fun updateScene(scene: String) {
    lastScene = scene
    if (destroyed || map == null) return
    try { render(JSONObject(scene)) }
    catch (error: Exception) { onMapStatus(mapOf("error" to (error.message ?: "地图数据加载失败"))) }
  }

  private fun coordinates(points: JSONArray): List<LatLng> = (0 until points.length()).map {
    val point = points.getJSONObject(it)
    display(LatLng(point.getDouble("lat"), point.getDouble("lng")))
  }

  private fun render(scene: JSONObject) {
    val sdk = map ?: return
    val cells = scene.getJSONArray("cells")
    if (cells.toString() != cellsJson) {
      polygons.forEach { it.remove() }; polygons.clear(); cellKeys.clear()
      for (i in 0 until cells.length()) {
        val cell = cells.getJSONObject(i)
        val color = Color.parseColor(cell.getString("color"))
        val alpha = (cell.getDouble("opacity") * 255).toInt().coerceIn(0, 255)
        val polygon = sdk.addPolygon(PolygonOptions().addAll(coordinates(cell.getJSONArray("points")))
          .fillColor((color and 0x00ffffff) or (alpha shl 24)).strokeColor(color).strokeWidth(2f).zIndex(1f))
        polygons.add(polygon); cellKeys[polygon.id] = cell.getString("key")
      }
      cellsJson = cells.toString()
    }
    val points = coordinates(scene.getJSONArray("route"))
    if (points.size > 1) {
      if (route == null) {
        routeOutline = sdk.addPolyline(PolylineOptions().addAll(points).color(Color.WHITE).width(17f).zIndex(3f))
        route = sdk.addPolyline(PolylineOptions().addAll(points).color(Color.rgb(30, 102, 82)).width(9f).zIndex(4f))
      } else { route!!.points = points; routeOutline!!.points = points }
    } else { route?.remove(); route = null; routeOutline?.remove(); routeOutline = null }
    if (points.isNotEmpty()) {
      if (position == null) position = sdk.addCircle(CircleOptions().center(points.last()).radius(5.0)
        .fillColor(Color.rgb(53, 103, 217)).strokeColor(Color.WHITE).strokeWidth(3f).zIndex(5f))
      else position!!.center = points.last()
    } else { position?.remove(); position = null }
    val camera = scene.optJSONObject("camera") ?: return
    if (!loaded || width == 0 || height == 0 || camera.getString("id") == cameraId) return
    val cameraPoints = coordinates(camera.getJSONArray("points"))
    if (cameraPoints.isEmpty()) return
    cameraId = camera.getString("id")
    if (cameraPoints.size == 1) sdk.moveCamera(CameraUpdateFactory.newLatLngZoom(cameraPoints[0], 16f))
    else {
      val bounds = LatLngBounds.builder(); cameraPoints.forEach { bounds.include(it) }
      sdk.moveCamera(CameraUpdateFactory.newLatLngBounds(bounds.build(), width, height, (24 * resources.displayMetrics.density).toInt()))
    }
  }

  override fun onAttachedToWindow() { super.onAttachedToWindow(); onHostResume() }
  fun onHostResume() {
    if (destroyed) return
    mapView?.onResume()
    handler.removeCallbacks(timeout)
    if (!loaded) handler.postDelayed(timeout, 20000)
  }
  fun onHostPause() { if (!destroyed) { handler.removeCallbacks(timeout); mapView?.onPause() } }
  fun dispose() {
    if (destroyed) return
    destroyed = true
    handler.removeCallbacks(timeout)
    views.remove(this)
    mapView?.onPause(); mapView?.onDestroy(); mapView = null; map = null
    polygons.clear(); cellKeys.clear(); converted.clear()
  }
}
