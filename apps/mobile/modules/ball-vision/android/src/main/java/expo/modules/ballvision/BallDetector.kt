package expo.modules.ballvision

import android.content.Context
import android.graphics.Bitmap
import org.tensorflow.lite.support.image.TensorImage
import org.tensorflow.lite.task.vision.detector.ObjectDetector

/** CPU, synchronous inference. The caller owns the serial executor and bitmap lifetime. */
class BallDetector(context: Context) : AutoCloseable {
  private val detector = try {
    ObjectDetector.createFromFileAndOptions(context,"efficientdet_lite0.tflite",
      ObjectDetector.ObjectDetectorOptions.builder().setNumThreads(2).setScoreThreshold(0.45f)
        .setLabelAllowList(listOf("sports ball")).setMaxResults(3).build())
  } catch (error: LinkageError) { throw IllegalStateException("本机无法加载球体推理引擎",error) }

  fun detect(bitmap: Bitmap, timestampMs: Double, mirrored: Boolean): Map<String, Any> {
    val started = android.os.SystemClock.elapsedRealtimeNanos()
    val image = TensorImage.fromBitmap(bitmap)
    run {
      val result = detector.detect(image)
      val balls = result.mapNotNull { detection ->
        val bounds = detection.boundingBox
        val confidence = detection.categories.maxOfOrNull { it.score } ?: 0f
        val left = bounds.left.coerceIn(0f, bitmap.width.toFloat())
        val right = bounds.right.coerceIn(0f, bitmap.width.toFloat())
        val top = bounds.top.coerceIn(0f, bitmap.height.toFloat())
        val bottom = bounds.bottom.coerceIn(0f, bitmap.height.toFloat())
        if (right <= left || bottom <= top) null else mapOf("x" to (left+right)/2/bitmap.width,
          "y" to (top+bottom)/2/bitmap.height, "width" to (right-left)/bitmap.width,
          "height" to (bottom-top)/bitmap.height, "confidence" to confidence)
      }
      return mapOf("timestampMs" to timestampMs, "width" to bitmap.width, "height" to bitmap.height,
        "mirrored" to mirrored, "balls" to balls, "inferenceMs" to (android.os.SystemClock.elapsedRealtimeNanos()-started)/1e6)
    }
  }
  override fun close() { detector.close() }
}
