package com.czert.blackexit;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.widget.FrameLayout;
import android.widget.TextView;

/** Safe fullscreen demo, not a device locker. Home and Back always remain available. */
public final class MainActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().getDecorView().setBackgroundColor(Color.BLACK);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);

        FrameLayout screen = new FrameLayout(this);
        screen.setBackgroundColor(Color.BLACK);

        TextView exit = new TextView(this);
        exit.setText("×");
        exit.setTextColor(Color.WHITE);
        exit.setTextSize(86);
        exit.setGravity(Gravity.CENTER);
        exit.setContentDescription("Zavrieť aplikáciu a ísť domov");
        exit.setClickable(true);
        exit.setFocusable(true);
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(dp(128), dp(128), Gravity.CENTER);
        screen.addView(exit, params);
        exit.setOnClickListener(v -> closeToHome());

        setContentView(screen);
        hideSystemBarsTemporarily();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void hideSystemBarsTemporarily() {
        // A normal swipe reveals system bars. This does NOT lock Android.
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }
    }

    private void closeToHome() {
        Intent home = new Intent(Intent.ACTION_MAIN);
        home.addCategory(Intent.CATEGORY_HOME);
        home.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(home);
        finish();
    }
}
