const { loadChannels } = require('./channels');

export const getContext = async (config) => {
  const groups = await loadChannels(config);

  return {
    config,
    groups,
  };
};
