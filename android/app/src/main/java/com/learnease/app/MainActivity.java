package com.learnease.app;

import android.content.Intent;
import android.content.Context;
import android.content.res.Configuration;
import android.net.Uri;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.content.pm.ActivityInfo;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.autofill.AutofillManager;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebChromeClient;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.widget.FrameLayout;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import java.util.Locale;
import org.json.JSONObject;

import androidx.activity.OnBackPressedCallback;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {
    private TextToSpeech textToSpeech;
    private volatile boolean textToSpeechReady = false;
    private boolean videoChromeInstalled = false;
    private volatile boolean keepNativeSplash = true;
    private View videoCustomView;
    private WebChromeClient.CustomViewCallback videoCustomViewCallback;
    private FrameLayout videoFullscreenContainer;
    private int orientationBeforeVideoFullscreen = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
    private volatile String pendingDeepLinkPath = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        splash.setKeepOnScreenCondition(() -> keepNativeSplash);
        splash.setOnExitAnimationListener(splashView -> splashView.remove());
        super.onCreate(savedInstanceState);
        pendingDeepLinkPath = deepLinkPath(getIntent());
        new Handler(Looper.getMainLooper()).postDelayed(() -> keepNativeSplash = false, 8000);
        attachNativeBridges();
        installVideoFullscreenClient();
        textToSpeech = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS) {
                textToSpeech.setLanguage(Locale.US);
                textToSpeech.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String utteranceId) { notifyTts(utteranceId, "start"); }
                    @Override public void onDone(String utteranceId) { notifyTts(utteranceId, "done"); }
                    @Override public void onError(String utteranceId) { notifyTts(utteranceId, "error"); }
                    @Override public void onError(String utteranceId, int errorCode) { notifyTts(utteranceId, "error"); }
                    @Override public void onStop(String utteranceId, boolean interrupted) { notifyTts(utteranceId, "stop"); }
                });
                textToSpeechReady = true;
            }
        });
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (hideVideoFullscreen()) return;
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
        updateImmersiveMode();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String path = deepLinkPath(intent);
        if (path == null) return;
        pendingDeepLinkPath = path;
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().post(() -> bridge.getWebView().evaluateJavascript(
                    "window.dispatchEvent(new Event('learnease-deeplink'))", null));
        }
    }

    /** learnease://open/app/signin -> "/app/signin" */
    private static String deepLinkPath(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return null;
        Uri uri = intent.getData();
        if (uri == null || !"learnease".equals(uri.getScheme()) || !"open".equals(uri.getHost())) return null;
        String path = uri.getPath();
        if (path == null || !path.startsWith("/") || path.startsWith("//")) return null;
        return path;
    }

    public class DeepLinkBridge {
        @JavascriptInterface
        public String consume() {
            String path = pendingDeepLinkPath;
            pendingDeepLinkPath = null;
            return path == null ? "" : path;
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        attachNativeBridges();
        installVideoFullscreenClient();
    }

    private void attachNativeBridges() {
        if (bridge == null || bridge.getWebView() == null) return;
        bridge.getWebView().addJavascriptInterface(new OrientationBridge(), "AndroidOrientation");
        bridge.getWebView().addJavascriptInterface(new TextToSpeechBridge(), "AndroidTts");
        bridge.getWebView().addJavascriptInterface(new SplashBridge(), "AndroidSplash");
        bridge.getWebView().addJavascriptInterface(new BrowserBridge(), "AndroidBrowser");
        bridge.getWebView().addJavascriptInterface(new AutofillBridge(), "AndroidAutofill");
        bridge.getWebView().addJavascriptInterface(new DeepLinkBridge(), "AndroidDeepLink");
        bridge.getWebView().addJavascriptInterface(new PrintBridge(), "AndroidPrint");
    }

    private void installVideoFullscreenClient() {
        if (videoChromeInstalled) return;
        if (bridge == null || bridge.getWebView() == null) return;
        bridge.getWebView().setWebChromeClient(new LessonVideoChromeClient());
        videoChromeInstalled = true;
    }

    private boolean hideVideoFullscreen() {
        if (videoCustomView == null) return false;
        WebChromeClient.CustomViewCallback callback = videoCustomViewCallback;
        hideVideoCustomView();
        if (callback != null) callback.onCustomViewHidden();
        return true;
    }

    private void showVideoCustomView(View view, WebChromeClient.CustomViewCallback callback) {
        if (videoCustomView != null) {
            callback.onCustomViewHidden();
            return;
        }

        videoCustomView = view;
        videoCustomViewCallback = callback;
        orientationBeforeVideoFullscreen = getRequestedOrientation();
        // Follow the phone when auto-rotate is on; stay put if the user locked rotation.
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_FULL_USER);

        ViewGroup decor = (ViewGroup) getWindow().getDecorView();
        videoFullscreenContainer = new FrameLayout(this);
        videoFullscreenContainer.setBackgroundColor(Color.BLACK);
        videoFullscreenContainer.addView(view, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        decor.addView(videoFullscreenContainer, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        if (bridge.getWebView() != null) {
            bridge.getWebView().setVisibility(View.GONE);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        updateImmersiveMode();
    }

    private void hideVideoCustomView() {
        if (videoCustomView == null) return;

        ViewGroup decor = (ViewGroup) getWindow().getDecorView();
        if (videoFullscreenContainer != null) {
            decor.removeView(videoFullscreenContainer);
        }
        if (bridge.getWebView() != null) {
            bridge.getWebView().setVisibility(View.VISIBLE);
        }
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        videoCustomView = null;
        videoCustomViewCallback = null;
        videoFullscreenContainer = null;
        setRequestedOrientation(orientationBeforeVideoFullscreen);
        updateImmersiveMode();
    }

    public class SplashBridge {
        @JavascriptInterface
        public void hide() {
            keepNativeSplash = false;
        }
    }

    public class BrowserBridge {
        @JavascriptInterface
        public void open(String url) {
            if (url == null || (!url.startsWith("http://") && !url.startsWith("https://"))) return;
            runOnUiThread(() -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))));
        }
    }

    public class PrintBridge {
        @JavascriptInterface
        public void print(String title) {
            runOnUiThread(() -> {
                if (bridge == null || bridge.getWebView() == null) return;
                WebView webView = bridge.getWebView();
                PrintManager printManager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                if (printManager == null) return;
                String jobName = title == null || title.trim().isEmpty()
                        ? "LearnEase Attendance Record"
                        : title.trim();
                PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(jobName);
                printManager.print(jobName, adapter, null);
            });
        }
    }

    public class AutofillBridge {
        @JavascriptInterface
        public void setEnabled(boolean enabled) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
            runOnUiThread(() -> {
                if (bridge == null || bridge.getWebView() == null) return;
                bridge.getWebView().setImportantForAutofill(enabled
                        ? View.IMPORTANT_FOR_AUTOFILL_AUTO
                        : View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
                if (!enabled) {
                    AutofillManager autofill = getSystemService(AutofillManager.class);
                    if (autofill != null) autofill.cancel();
                }
            });
        }
    }

    private void notifyTts(String utteranceId, String event) {
        if (utteranceId == null || utteranceId.startsWith("learnease-")) return;
        if (bridge == null || bridge.getWebView() == null) return;
        final String script = "window.__androidTtsEvent&&window.__androidTtsEvent("
                + JSONObject.quote(utteranceId) + "," + JSONObject.quote(event) + ")";
        bridge.getWebView().post(() -> {
            if (bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().evaluateJavascript(script, null);
            }
        });
    }

    private void speakOnUiThread(String text, float rate, float pitch, boolean interrupt, String utteranceId) {
        if (text == null || text.trim().isEmpty()) return;
        final String id = (utteranceId == null || utteranceId.isEmpty())
                ? "learnease-" + System.nanoTime()
                : utteranceId;
        runOnUiThread(() -> {
            if (!textToSpeechReady || textToSpeech == null) return;
            textToSpeech.setSpeechRate(Math.max(0.55f, Math.min(rate, 1.6f)));
            textToSpeech.setPitch(Math.max(0.7f, Math.min(pitch, 1.8f)));
            textToSpeech.speak(text,
                    interrupt ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD,
                    null,
                    id);
        });
    }

    public class TextToSpeechBridge {
        @JavascriptInterface
        public void speak(String text, float rate, float pitch, boolean interrupt) {
            speakOnUiThread(text, rate, pitch, interrupt, null);
        }

        @JavascriptInterface
        public void speakTracked(String text, float rate, float pitch, boolean interrupt, String utteranceId) {
            speakOnUiThread(text, rate, pitch, interrupt, utteranceId);
        }

        @JavascriptInterface public void cancel() {
            runOnUiThread(() -> { if (textToSpeech != null) textToSpeech.stop(); });
        }

        @JavascriptInterface public boolean isReady() { return textToSpeechReady; }
    }

    public class OrientationBridge {
        @JavascriptInterface
        public void allowGameRotation() {
            runOnUiThread(() -> setRequestedOrientation(
                    ActivityInfo.SCREEN_ORIENTATION_FULL_USER
            ));
        }

        @JavascriptInterface
        public void lockLandscape() {
            runOnUiThread(() -> setRequestedOrientation(
                    ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            ));
        }

        @JavascriptInterface
        public void lockPortrait() {
            runOnUiThread(() -> setRequestedOrientation(
                    ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
            ));
        }
    }

    private class LessonVideoChromeClient extends BridgeWebChromeClient {
        LessonVideoChromeClient() {
            super(bridge);
        }

        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
            showVideoCustomView(view, callback);
        }

        @Override
        public void onHideCustomView() {
            hideVideoCustomView();
        }
    }

    private void updateImmersiveMode() {
        boolean isLandscape = getResources().getConfiguration().orientation
                == Configuration.ORIENTATION_LANDSCAPE;
        boolean immersive = isLandscape || videoCustomView != null;

        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(
                getWindow(), getWindow().getDecorView()
        );

        if (immersive) {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            );
            WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
            getWindow().setStatusBarColor(Color.TRANSPARENT);
            getWindow().setNavigationBarColor(Color.TRANSPARENT);
            controller.setSystemBarsBehavior(
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            );
            controller.hide(WindowInsetsCompat.Type.systemBars());

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                WindowManager.LayoutParams attributes = getWindow().getAttributes();
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    attributes.layoutInDisplayCutoutMode =
                            WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
                } else {
                    attributes.layoutInDisplayCutoutMode =
                            WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                }
                getWindow().setAttributes(attributes);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
            controller.show(WindowInsetsCompat.Type.systemBars());
            WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        updateImmersiveMode();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) updateImmersiveMode();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        updateImmersiveMode();
    }

    @Override
    public void onDestroy() {
        if (textToSpeech != null) {
            textToSpeech.stop();
            textToSpeech.shutdown();
        }
        super.onDestroy();
    }
}
