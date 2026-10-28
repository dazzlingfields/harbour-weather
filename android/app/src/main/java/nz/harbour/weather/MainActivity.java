package nz.harbour.weather;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String agent = bridge.getWebView().getSettings().getUserAgentString();
        bridge.getWebView().getSettings().setUserAgentString(agent + " Harbour/0.3 (+https://github.com/dazzlingfields/harbour-weather)");
        // Close sheets and dialogs before Android Back leaves the app.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                bridge.getWebView().evaluateJavascript(
                    "Boolean(window.harbourBack && window.harbourBack())",
                    handled -> {
                        if (!"true".equals(handled)) {
                            setEnabled(false);
                            getOnBackPressedDispatcher().onBackPressed();
                            setEnabled(true);
                        }
                    }
                );
            }
        });
    }
}
