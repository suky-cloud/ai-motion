package expo.modules.ballvision

import android.media.MediaMetadataRetriever
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BallVisionModule : Module() {
  private val analysing = java.util.concurrent.atomic.AtomicBoolean(false)
  override fun definition() = ModuleDefinition {
    Name("BallVision")
    View(BallCameraView::class) {
      Events("onObservation","onFailure","onReady")
      Prop("active") { view: BallCameraView, value: Boolean -> view.active = value }
      Prop("sessionToken") { view: BallCameraView, value: String -> view.sessionToken = value }
      OnViewDidUpdateProps { view: BallCameraView -> view.update() }
      OnViewDestroys { view: BallCameraView -> view.destroy() }
    }
    AsyncFunction("analyzeVideo") { uri: String ->
      check(analysing.compareAndSet(false,true)) { "已有视频在本地分析，请等待该任务完成" }
      try {
      val parsed = Uri.parse(uri)
      require(parsed.scheme == "content" || parsed.scheme == "file") { "Only selected local videos are accepted" }
      val context = appContext.reactContext ?: error("No React context")
      val retriever = MediaMetadataRetriever()
      try {
        BallDetector(context).use { detector ->
        retriever.setDataSource(context, parsed)
        val duration = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: error("Video duration unavailable")
        require(duration in 1..60000) { "请选择不超过 60 秒的本地视频" }
        val frames = ArrayList<Map<String,Any>>()
        for (time in 0 until minOf(duration,30000L) step 67) {
          val bitmap = retriever.getScaledFrameAtTime(time*1000,MediaMetadataRetriever.OPTION_CLOSEST,640,640) ?: error("视频帧无法解码")
          try { frames.add(detector.detect(bitmap,time.toDouble(),false)) } finally { bitmap.recycle() }
        }
        mapOf("durationMs" to duration.toDouble(), "frames" to frames)
        }
      } finally { retriever.release() }
      } finally { analysing.set(false) }
    }
  }
}
