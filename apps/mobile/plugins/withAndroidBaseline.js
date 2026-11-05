const { withProjectBuildGradle } = require('expo/config-plugins');

// Resolve common modules at the same versions in Development Build and offline test variants.
const marker = '// AI Motion consistent Android dependency baseline';
module.exports = function withAndroidBaseline(config) {
  return withProjectBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') throw new Error('AI Motion expects the Expo Groovy Android template');
    if (!mod.modResults.contents.includes(marker)) {
      mod.modResults.contents += `
${marker}
gradle.projectsEvaluated {
  rootProject.allprojects { child ->
    ['CompileClasspath', 'RuntimeClasspath'].each { suffix ->
      def releaseClasspath = child.configurations.findByName('release' + suffix)
      def debugClasspath = child.configurations.findByName('debug' + suffix)
      if (releaseClasspath != null && debugClasspath != null) {
        releaseClasspath.shouldResolveConsistentlyWith(debugClasspath)
      }
    }
  }
}
`;
    }
    return mod;
  });
};
