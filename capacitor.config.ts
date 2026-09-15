const allowLocalHttp = process.env.CAPACITOR_ALLOW_CLEARTEXT === "true";

const config = {
  appId: "com.firewallsoar.app",
  appName: "Firewall SOAR",
  webDir: "dist",
  server: {
    androidScheme: "https",
    cleartext: allowLocalHttp
  },
  android: {
    allowMixedContent: allowLocalHttp
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true
    }
  }
};

export default config;
