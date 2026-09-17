package com.firewallsoar.app;

import android.os.Bundle;
import com.firewallsoar.localssh.LocalSshPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LocalSshPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
