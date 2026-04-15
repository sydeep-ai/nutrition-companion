/**
 * Merges app.json and injects env into `extra` so runtime code can read the key via expo-constants.
 */
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    anthropicApiKey: process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || '',
  },
});
