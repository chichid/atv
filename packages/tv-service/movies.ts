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

  console.log('[tv-service] getMovies is waking up the transcoder...');
  get(`${Config.TranscoderPingUrl}`);

  const { movies }= await fetchSources();
  const filteredMovies = filterMovies(movies, search, categoryId);
	const sortedMovies = search ? filteredMovies : filteredMovies.sort((a, b) => b.Rating - a.Rating);

  const off = Number(offset) || 0;
  const lim = Number(limit) || Config.DefaultPageSize;
  const moviesPage = sortedMovies.slice(off, off + lim);

  res.json({
    count: filteredMovies.length,
    items: moviesPage,
  });
};

export const getMovieCategories = async (req, res) => {
  const { categories }= await fetchSources();
  res.json({
		items: categories
	});
};

const filterMovies = (movieList, searchTerm, categoryId) => {
  const categoryMovies = !categoryId ? movieList : movieList.filter(m => m.Category && m.Category.Id == categoryId);

  if (searchTerm) {
    const options = {
      keys: ['MovieName'],
      threshold: 0.01,
      includeScore: true,
    };

    const items = new Fuse(movieList, options).search(searchTerm);
    const searchResultSort = (a, b) => a.item.Category && a.item.Category.Id === categoryId ? - 1 : 1;

    return items.sort(searchResultSort).map(i => i.item);
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

  const categoriesMap = {};
  movies.forEach(({ Category }) => { 
    if (Category) {
      categoriesMap[Category.Id] = Category; 
    }
  });

  const categories = Object.keys(categoriesMap).map(k => categoriesMap[k]);

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
  const StreamUrl = `${protocol}://${serverUrl}/${streamType}/${username}/${password}/${streamId}.${ext}`;

  return {
    MovieName,
    StreamUrl: `${Config.TranscoderUrl}/${encodeURIComponent(StreamUrl)}`,
    LogoUrl,
    Rating,
    Category,
  };
};

