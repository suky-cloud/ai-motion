package expo.modules.ballvision

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Matrix
import android.util.Size
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class BallCameraView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  override val shouldUseAndroidLayout = true
  private val onObservation by EventDispatcher()
  private val onFailure by EventDispatcher()
  private val onReady by EventDispatcher()
  private val preview = PreviewView(context).also { it.scaleType = PreviewView.ScaleType.FIT_CENTER; it.implementationMode = PreviewView.ImplementationMode.COMPATIBLE }
  private val executor = Executors.newSingleThreadExecutor()
  private val destroyed = AtomicBoolean(false)
  @Volatile private var generation = 0
  @Volatile var active = false
  var sessionToken = ""
  private var bound = false
  private var provider: ProcessCameraProvider? = null
  private var analysis: ImageAnalysis? = null
  private var previewUseCase: Preview? = null
  private var detector: BallDetector? = null
  private var lastFrameNs = 0L
  init { addView(preview, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)) }
  override fun onAttachedToWindow() { super.onAttachedToWindow(); update() }
  override fun onDetachedFromWindow() { stop(); super.onDetachedFromWindow() }
  fun update() {
    if (!active || !isAttachedToWindow || destroyed.get()) { stop(); return }
    if (bound) return
    bound = true
    val current = ++generation
    val token = sessionToken
    val future = ProcessCameraProvider.getInstance(context)
    future.addListener({
      if (destroyed.get() || current != generation || !active || !isAttachedToWindow) return@addListener
      try {
        val owner = appContext.currentActivity as? LifecycleOwner ?: throw IllegalStateException("No activity lifecycle")
        provider = future.get()
        val output = Preview.Builder().build().also { it.setSurfaceProvider(preview.surfaceProvider) }
        val frames = ImageAnalysis.Builder().setTargetResolution(Size(640,480))
          .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
          .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
        previewUseCase = output; analysis = frames
        lastFrameNs = 0
        frames.setAnalyzer(executor) { frame ->
          try {
            if (destroyed.get() || !active || current != generation) return@setAnalyzer
            val timestamp = frame.imageInfo.timestamp
            if (timestamp-lastFrameNs < 66_000_000) return@setAnalyzer
            lastFrameNs = timestamp
            if (detector == null) detector = BallDetector(context)
            val raw = frame.toBitmap()
            val rotation = frame.imageInfo.rotationDegrees
            val bitmap = if (rotation == 0) raw else Bitmap.createBitmap(raw,0,0,raw.width,raw.height,Matrix().apply { postRotate(rotation.toFloat()) },true)
            try {
              // JS receives native monotonic time only as a diagnostic; maps it to the host clock at arrival.
              val observation = detector!!.detect(bitmap, timestamp/1e6, true)
              post { if (!destroyed.get() && current == generation && active) onObservation(mapOf("token" to token, "frame" to observation)) }
            } finally { if (bitmap !== raw) bitmap.recycle(); raw.recycle() }
          } catch (_: Exception) {
            post { if (!destroyed.get() && current == generation) { onFailure(mapOf("message" to "球体识别无法运行，请暂停后重试。", "token" to token)); active = false; stop() } }
          } finally { frame.close() }
        }
        provider!!.bindToLifecycle(owner, CameraSelector.DEFAULT_FRONT_CAMERA, output, frames)
        onReady(mapOf("token" to token))
      } catch (_: Exception) { active = false; stop(); onFailure(mapOf("message" to "无法打开前置相机，请检查权限后重试。", "token" to token)) }
    }, ContextCompat.getMainExecutor(context))
  }
  private fun stop() {
    generation++; bound = false
    analysis?.clearAnalyzer()
    val useCases = listOfNotNull(previewUseCase,analysis).toTypedArray()
    if (useCases.isNotEmpty()) provider?.unbind(*useCases)
    analysis = null; previewUseCase = null
    if (!executor.isShutdown) executor.execute { detector?.close(); detector = null }
  }
  fun destroy() { if (destroyed.compareAndSet(false,true)) { active = false; stop(); executor.shutdown() } }
}
