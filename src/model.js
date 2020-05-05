const { loadChannels } = require('./channels');

export const getContext = async (config) => {
  const Channels = await loadChannels(config);

  return {
    config,
    Channels,
  };
};
