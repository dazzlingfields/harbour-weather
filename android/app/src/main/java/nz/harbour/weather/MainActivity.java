package nz.harbour.weather;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String agent = bridge.getWebView().getSettings().getUserAgentString();
        bridge.getWebView().getSettings().setUserAgentString(agent + " Harbour/0.1 (+https://github.com/dazzlingfields/harbour-weather)");
    }
}
