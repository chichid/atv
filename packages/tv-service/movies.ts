const Fuse = require('fuse.js');

import * as Config from './config';
import { get } from 'common/utils';

const cache = {
  movieSources: null,
  movies: null, 
};

export const reloadMovies = async (req, res) => {
  delete cache.movies;
  await fetchAllMovies();
  res.json(cache.movies);
};

export const getAllMovies = async (req, res) => {
  const { offset, limit, search } = req.query;

  const movies = await fetchAllMovies();
  const filteredMovies = filterMovies(movies, search);
  const moviesPage = filteredMovies.slice(Number(offset), Number(offset) + Number(limit));

  res.json(moviesPage);
};

const filterMovies = (movieList, searchTerm) => {
  if (searchTerm) {
    const fuse = new Fuse(movieList, {
      keys: ['MovieName'],
    });

    return fuse.search(searchTerm).map(i => i.item);
  } else {
    return movieList;
  }
};

const fetchAllMovies = async () => {
  if (cache.movies) {
    console.log(`[tv-service] returning movies from cache`);
    return cache.movies;
  }

  console.log(`[tv-service] calling GetChannelGroups...`);
  const sources = await get(Config.GoogleSheetActions.GetSources);
  let flatMap = [];

  Object.keys(sources).forEach(k => {
    const source = sources[k];
    const movies = source.vodStreams.map(vod => mapMovieFromVodStream(source,  vod));
    flatMap = [...flatMap, ...movies]
  });

  cache.movieSources = sources;
  cache.movies = flatMap;

  return flatMap;
};

const mapMovieFromVodStream = (source, vod) => {
  const serverUrl = source.serverUrl.replace('http://', '').replace('https://', '');
  const serverInfo = source.serverInfo;
  const userInfo = source.userInfo;

  const MovieName = vod.name;
  const LogoUrl = vod.stream_icon;
  const Rating = Number(vod.rating) || 0;

  const protocol = serverInfo.protocol || 'http';
  const username = userInfo.username;
  const password = userInfo.password;
  const ext = vod.container_extension;
  const streamType = vod.stream_type || 'movies';
  const streamId = vod.stream_id;
  const MovieUrl = `${protocol}://${serverUrl}/${streamType}/${username}/${password}/${streamId}.${ext}`;

  return {
    MovieName,
    MovieUrl,
    LogoUrl,
    Rating,
  };
};
