package com.learnease.app;

import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.content.pm.ActivityInfo;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.speech.tts.TextToSpeech;
import java.util.Locale;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private TextToSpeech textToSpeech;
    private volatile boolean textToSpeechReady = false;
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Exposes safe orientation controls to the local Capacitor web app.
        bridge.getWebView().addJavascriptInterface(new OrientationBridge(), "AndroidOrientation");
        bridge.getWebView().addJavascriptInterface(new TextToSpeechBridge(), "AndroidTts");
        textToSpeech = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS) {
                textToSpeech.setLanguage(Locale.US);
                textToSpeechReady = true;
            }
        });
        updateImmersiveMode();
    }

    public class TextToSpeechBridge {
        @JavascriptInterface
        public void speak(String text, float rate, float pitch, boolean interrupt) {
            if (text == null || text.trim().isEmpty()) return;
            runOnUiThread(() -> {
                if (!textToSpeechReady || textToSpeech == null) return;
                textToSpeech.setSpeechRate(Math.max(0.55f, Math.min(rate, 1.6f)));
                textToSpeech.setPitch(Math.max(0.7f, Math.min(pitch, 1.8f)));
                textToSpeech.speak(text,
                        interrupt ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD,
                        null,
                        "learnease-" + System.nanoTime());
            });
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

    private void updateImmersiveMode() {
        boolean isLandscape = getResources().getConfiguration().orientation
                == Configuration.ORIENTATION_LANDSCAPE;

        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(
                getWindow(), getWindow().getDecorView()
        );

        if (isLandscape) {
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
