const { withAndroidManifest, withGradleProperties, withAppBuildGradle } = require('expo/config-plugins');
module.exports = function withLocalSync(config) {
  config = withAppBuildGradle(config, mod => {
    const marker = '// AI Motion Windows native object path limit';
    if (!mod.modResults.contents.includes(marker)) mod.modResults.contents += `
${marker}
android { defaultConfig { externalNativeBuild { cmake { arguments "-DCMAKE_OBJECT_PATH_MAX=240" } } } }
`;
    return mod;
  });
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
