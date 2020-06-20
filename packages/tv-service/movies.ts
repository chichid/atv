const Fuse = require('fuse.js');
import * as Config from './config';
import { get } from 'common/utils';

const cache = {
  movieSources: null,
  movies: null, 
  categories: null,
};

export const reloadMovies = async (req, res) => {
  delete cache.movies;
  await fetchSources();
  res.json(cache.movies);
};

export const getMovies = async (req, res) => {
  const { offset, limit, search, categoryId } = req.query;

  const { movies }= await fetchSources();
  const filteredMovies = filterMovies(movies, search, categoryId);
	const sortedMovies = filteredMovies.sort((a, b) => b.Rating - a.Rating);

  const off = Number(offset) || 0;
  const lim = Number(limit) || Config.DefaultPageSize;
  const moviesPage = sortedMovies.slice(off, off + lim);

  res.json({
    count: movies.length,
    items: moviesPage,
  });
};

export const getMovieCategories = async (req, res) => {
  const { categories }= await fetchSources();
  res.json(categories);
};

const filterMovies = (movieList, searchTerm, categoryId) => {
  const categoryMovies = !categoryId ? movieList : movieList.filter(m => m.Category && m.Category.Id == categoryId);

  if (searchTerm) {
    const fuse = new Fuse(categoryMovies, {
      keys: ['MovieName'],
    });

    return fuse.search(searchTerm).map(i => i.item);
  } else {
    return categoryMovies;
  }
};

const fetchSources = async () => {
  if (cache.movies) {
    console.log(`[tv-service] returning movies and categories from cache`);

    return {
      movies: cache.movies,
      categories: cache.categories
    };
  }

  console.log(`[tv-service] calling GetChannelGroups...`);
  const sources = await get(Config.GoogleSheetActions.GetSources);
  let movies = [];

  Object.keys(sources).forEach(k => {
    const source = sources[k];
    const sourceMovies = source.vodStreams.map(vod => mapMovieFromVodStream(source,  vod));
    movies = [...movies, ...sourceMovies]
  });

  const categoriesSet = new Set(movies.map(m => m.Category).filter(c => c ? true : false));
  const categories = Array.from(categoriesSet);

  cache.movieSources = sources;
  cache.movies = movies;
  cache.categories = categories; 

  return { movies, categories };
};

const mapMovieFromVodStream = (source, vod) => {
  const serverUrl = source.serverUrl.replace('http://', '').replace('https://', '');
  const serverInfo = source.serverInfo;
  const userInfo = source.userInfo;

  const MovieName = vod.name;
  const LogoUrl = vod.stream_icon;
  const Rating = Number(vod.rating) || 0;

  const vodCategory = source.vodCategories.find(c => c.category_id === vod.category_id);
  const Category = !vodCategory ? null : {
    Id: vodCategory.category_id,
    Name: vodCategory.category_name,
    ParentId: vodCategory.parent_id,
  };
   
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
    Category,
  };
};

