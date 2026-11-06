const { withAndroidManifest, withGradleProperties } = require('expo/config-plugins');
module.exports = function withLocalSync(config) {
  config = withGradleProperties(config, mod => {
    for (const key of ['android.compileSdkVersion', 'android.targetSdkVersion']) {
      mod.modResults = mod.modResults.filter(item => item.key !== key);
      mod.modResults.push({ type: 'property', key, value: '37' });
    }
    return mod;
  });
  return withAndroidManifest(config, mod => {
    // Local pairing intentionally uses ws:// on private networks. No cloud camera upload.
    mod.modResults.manifest.application[0].$['android:usesCleartextTraffic'] = 'true';
    return mod;
  });
};
