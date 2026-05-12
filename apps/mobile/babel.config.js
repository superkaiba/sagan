module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'react' }]],
    // Reanimated's worklet transform must be the last plugin. Listed eagerly
    // so the first `useSharedValue` / `useAnimatedStyle` import doesn't fail
    // with "Reanimated 2 failed to create a worklet" on a cold build.
    plugins: ['react-native-reanimated/plugin'],
  };
};
