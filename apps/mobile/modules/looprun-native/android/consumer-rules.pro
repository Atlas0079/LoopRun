# SDK entry points and native callbacks must retain the official class names.
-keep class com.amap.api.maps.** { *; }
-keep class com.autonavi.** { *; }
-keep class com.amap.api.trace.** { *; }
-keep class com.amap.api.location.** { *; }
-keep class com.amap.api.fence.** { *; }
-keep class com.amap.api.services.** { *; }
# Optional GNSS fusion extension referenced by the combined SDK; LoopRun uses Android GPS directly.
-dontwarn com.amap.ams.gnss.GnssSoftLocator
