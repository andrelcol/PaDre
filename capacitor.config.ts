import type { CapacitorConfig } from '@capacitor/cli'

const localHttp = process.env.CAPACITOR_CLEARTEXT !== '0'

const config: CapacitorConfig = {
  appId: 'com.padre.sportsclub.dev',
  appName: 'PaDre',
  webDir: 'dist',
  android: {
    allowMixedContent: localHttp,
  },
  server: {
    androidScheme: 'https',
    cleartext: localHttp,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#14343c',
      showSpinner: false,
    },
    StatusBar: {
      style: 'LIGHT',
      overlaysWebView: true,
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
}

export default config
