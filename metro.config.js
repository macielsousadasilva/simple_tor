const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  server: {
    // Desabilita o novo DevTools e mantém logs no terminal
    experimentalImportBundleSupport: false,
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);