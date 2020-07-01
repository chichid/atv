const Fuse = require('fuse.js');
import * as Config from './config';
import { get } from 'common/utils';
import { Movie, SourcePayload, VodPayload } from './model';

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
  get(`${Config.TranscoderPingUrl}`).catch(e => console.warn(`[tv-service] getMovies unable to wake the transcoder up`));

  console.log('[tv-service] fetching sources...');
  const { movies }= await fetchSources();

  console.log('[tv-service] filtering the movies...');
  const filteredMovies = filterMovies(movies, search, categoryId);

  console.log('[tv-service] sorting the movies...');
	const sortedMovies = search ? filteredMovies : filteredMovies.sort((a, b) => b.Rating - a.Rating);

  const off = Number(offset) || 0;
  const lim = Number(limit) || Config.DefaultPageSize;
  const moviesPage = sortedMovies.slice(off, off + lim);

  res.json({
    count: filteredMovies.length,
    items: moviesPage,
  });
};

export const getMovieDetail = async (req, res) => {
  res.end('service is working...');
};

export const getMovieCategories = async (req, res) => {
  const { categories }= await fetchSources();
  res.json({
		items: categories
	});
};

const filterMovies = (movieList: Movie[], searchTerm: string, categoryId: string) => {
  const categoryMovies = !categoryId ? movieList : movieList.filter(m => m.category && m.category.id == categoryId);

  if (searchTerm) {
    const options = {
      keys: ['movieName'],
      threshold: 0.01,
      includeScore: true,
    };

    const items = new Fuse(movieList, options).search(searchTerm);
    const searchResultSort = (a: {item: Movie}, _: {item: Movie}) => a.item && a.item.category && a.item.category.id === categoryId ? - 1 : 1;

    return items.sort(searchResultSort).map((i: {item: Movie}) => i.item);
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

const mapMovieFromVodStream = (source: SourcePayload, vod: VodPayload): Movie => {
  const serverUrl = source.serverUrl.replace('http://', '').replace('https://', '');
  const serverInfo = source.serverInfo;
  const userInfo = source.userInfo;

  const movieName = vod.name;
  const logoUrl = vod.stream_icon;
  const rating = Number(vod.rating) || 0;

  const vodCategory = source.vodCategories.find(c => c.category_id === vod.category_id);
  const category = !vodCategory ? null : {
    id: vodCategory.category_id,
    name: vodCategory.category_name,
    parentId: vodCategory.parent_id,
  };
   
  const protocol = serverInfo.protocol || 'http';
  const username = userInfo.username;
  const password = userInfo.password;
  const ext = vod.container_extension;
  const streamType = vod.stream_type || 'movies';
  const streamId = vod.stream_id;
  const StreamUrl = `${protocol}://${serverUrl}/${streamType}/${username}/${password}/${streamId}.${ext}`;

  const id = encodeURIComponent(movieName);

  return {
    id,
    movieName,
    streamUrl: `${Config.TranscoderUrl}/${encodeURIComponent(StreamUrl)}`,
    logoUrl,
    rating,
    category,
  };
};

