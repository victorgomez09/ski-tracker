module.exports = function (api) {
  const platform = api.caller((caller) => caller?.platform);
  let plugins = [];

  return {
    presets: ['babel-preset-expo'],
    plugins,
  };
};
