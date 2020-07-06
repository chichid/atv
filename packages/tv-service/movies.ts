const Fuse = require('fuse.js');
import * as Config from './config';
import { get, postForm } from 'common/utils';
import { 
  Movie, SourcePayload, VodPayload, VodInfoPayload, 
  MovieDetail, TmdbMovieDetailPayload, TmdbMovieSearchPayload 
} from './model';

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
  const { movieId } = req.params;

  console.log(`[tv-service] getting movie detail ${movieId}`);
  const movieDetail = await fetchMovieDetail(encodeURIComponent(movieId));

  if (movieDetail === null) {
    res.writeHead(404)
    res.end();
  }

  res.json(movieDetail);
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
  let movies: Movie[] = [];

  Object.keys(sources).forEach(k => {
    const source = sources[k] as SourcePayload;
    source.sourceId = k;

    const sourceMovies = source.vodStreams.map(vod => mapMovieFromVodStream(source,  vod));
    movies = [...movies, ...sourceMovies]
  });

  const categoriesMap = {};
  movies.forEach(({ category }) => { 
    if (category) {
      categoriesMap[category.id] = category; 
    }
  });

  const categories = Object.keys(categoriesMap).map(k => categoriesMap[k]);

  cache.movieSources = sources;
  cache.movies = movies;
  cache.categories = categories; 

  return { movies, categories };
};

const mapMovieFromVodStream = (source: SourcePayload, vod: VodPayload): Movie => {
  const movieName = vod.name;
  const logoUrl = vod.stream_icon;
  const rating = Number(vod.rating) || 0;

  const vodCategory = source.vodCategories.find(c => c.category_id === vod.category_id);
  const category = !vodCategory ? null : {
    id: vodCategory.category_id,
    name: vodCategory.category_name,
    parentId: vodCategory.parent_id,
  };
   
  const { username, password } = source.userInfo;
  const ext = vod.container_extension;
  const newLocal = vod.stream_type || Config.XstreamCodes.DefaultVodType;
  const streamType = newLocal;
  const streamId = vod.stream_id;
  const streamUrl = `${getSourceBaseUrl(source)}/${streamType}/${username}/${password}/${streamId}.${ext}`;

  const id = encodeURIComponent(movieName);
  const year = Number(vod.year) || null;
  const genre = vod.genre || '';

  return {
    id,
    sourceId: source.sourceId,
    movieName,
    streamId,
    year,
    genre,
    streamUrl: `${Config.TranscoderUrl}/${encodeURIComponent(streamUrl)}`,
    logoUrl,
    rating,
    category,
  };
};

const fetchMovieDetail = async (movieId: string): Promise<MovieDetail> => {
  if (!process.env.http_proxy) { 
    throw new Error(`[tv-service] fetchMovieDetail - http_proxy not provided, this service needs the proxy set`);
  }

  await fetchSources();
  const movie: Movie = cache.movies.find(m => m.id === movieId);
 
  if (!movie) { 
    console.log(`[tv-service] movie ${movieId} not found`);
    return null;
  }

  const tmdbMovieDetail: TmdbMovieDetailPayload = await fetchTmdbMovieDetail(movie);

  if (!tmdbMovieDetail) {
    console.log(`[tv-service] movie detail not found for ${movieId}`);
    return {
      ...movie,
      overview: null,
      youtubeTrailer: null,
    };
  }

  console.log(`[tv-service] got tmdb movie details, mapping...`);

  const tmdbYoutubeTrailer = tmdbMovieDetail.videos.results.find(rs => 
    rs.type && rs.site && 
    rs.type.toLowerCase() === Config.Tmdb.TypeTrailer.toLowerCase() && 
    rs.site.toLowerCase() === Config.Tmdb.SiteYoutube.toLowerCase()
  );

  const youtubeTrailer = tmdbYoutubeTrailer ? (Config.YoutubeUrlPrefix + tmdbYoutubeTrailer.key) : null;

  const genre = tmdbMovieDetail.genres.map(g => g.name).join(' | ');

  return {
    ...movie,
    overview: tmdbMovieDetail.overview,
    youtubeTrailer, 
    year: movie.year || new Date(tmdbMovieDetail.release_date).getUTCFullYear(),
    genre,
  };
};

const fetchVodInfo = async (movie: Movie): Promise<VodInfoPayload> => {
  const source = getSourceById(movie.sourceId);

  const postData = {
    username: source.userInfo.username,
    password: source.userInfo.password,
    action: Config.XstreamCodes.GetVodInfo,
    vod_id: movie.streamId,
  };

  return await postForm(getSourceBaseUrl(source) + '/player_api.php', postData, {
    'User-Agent': Config.XstreamCodes.UserAgent,
  }) as VodInfoPayload;
};

const fetchTmdbMovieDetail = async (movie: Movie): Promise<TmdbMovieDetailPayload> => {
  const payload = await fetchVodInfo(movie);

  if (!payload.info) {
    console.error(`[tv-service] unable to fetch tmdb info for movie ${movie.id}, info is null`);
    return null;
  }

  let tmdbId: string = payload.info.tmdb_id;

  if (!tmdbId) {
    console.log(`[tv-service] tmdbId not defined for ${movie.id}, using tmdb search`);
    const infoReleaseDate = payload.info.releasedate ? new Date(payload.info.releasedate).getUTCFullYear() : null;
    let movieYear: number = movie.year || infoReleaseDate || null;
    tmdbId = await searchTmdbMovie(movie.movieName, movieYear);
  }

  if (!tmdbId) {
    console.error(`[tv-service] unable to fetch tmdb info for movie ${movie.id}, unable to get tmdb movie id`);
    return null;
  }

  const nonTranslatedUrl = [`${Config.Tmdb.Endpoint}/movie/${tmdbId}`,
    `?api_key=${Config.Tmdb.ApiKey}`,
    `&append_to_response=videos`,
  ].join('');

  const nonTranslatedDetails = await get(nonTranslatedUrl) as TmdbMovieDetailPayload;

  const url = [`${Config.Tmdb.Endpoint}/movie/${tmdbId}`,
    `?language=${Config.Tmdb.Language}`,
    `&api_key=${Config.Tmdb.ApiKey}`,
    `&append_to_response=videos`,
  ].join('');

  const translatedDetails = await get(url) as TmdbMovieDetailPayload;

  for (const prop in translatedDetails) {
    if (!translatedDetails[prop] && nonTranslatedDetails[prop]) {
      translatedDetails[prop] = nonTranslatedDetails[prop];
    }
  }

  return translatedDetails;
};

const searchTmdbMovie = async (title: string, year: number): Promise<string> => {
  let url = `${Config.Tmdb.Endpoint}/search/movie?language=${Config.Tmdb.Language}&api_key=${Config.Tmdb.ApiKey}`;
  url += `&query=${encodeURIComponent(title)}`;

  if (year) {
    url += '&year=' + year;
  }

  const tmdbResponse = await get(url) as TmdbMovieSearchPayload;

  const firstMatchingResult = tmdbResponse.results.find(res => res.title.toLowerCase() === title.toLowerCase());
  if (!firstMatchingResult) {
    return null;
  } 

  return firstMatchingResult.id;
}

const getSourceById = (sourceId: string): SourcePayload => {
  return cache.movieSources[sourceId] || null;
};

const getSourceBaseUrl = (source: SourcePayload): string => {
  const protocol = source.serverInfo.protocol || 'http';
  const serverUrl = source.serverUrl.replace('http://', '').replace('https://', '');

  return `${protocol}://${serverUrl}`;
};

