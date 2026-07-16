package com.yatishara.studio;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(YatisharaMediaPlugin.class);
        super.onCreate(savedInstanceState);
        createNotificationChannels();
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;

        NotificationChannel general = new NotificationChannel(
            "studio_default",
            "Studio updates",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        general.setDescription("General Yatishara Studio notifications");

        NotificationChannel generations = new NotificationChannel(
            "studio_generation",
            "Generation progress",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        generations.setDescription("Generation progress, completion and failures");
        generations.enableVibration(true);

        NotificationChannel billing = new NotificationChannel(
            "studio_billing",
            "Billing updates",
            NotificationManager.IMPORTANCE_HIGH
        );
        billing.setDescription("Payment and credit notifications");

        manager.createNotificationChannel(general);
        manager.createNotificationChannel(generations);
        manager.createNotificationChannel(billing);
    }
}
