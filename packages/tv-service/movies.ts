import * as Config from './config';
import { get } from 'common/utils';
import * as TorrentSearchApi from 'torrent-search-api';
import { 
  MovieHeader, SourcePayload, VodPayload, 
  MovieDetail, MovieCategory, TmdbMovieDetailPayload, 
  TmdbDisoverMoviePayload, TmdbMovieGenreListPayload,
  TmdbMovieHeaderPayload 
} from './model';

const cache = {
  movieSources: null,
};

export const reloadMovies = async (req, res) => {
  delete cache.movieSources;
  res.writeHead(200);
  res.end();
};

export const getMovies = async (req, res) => {
  const { offset, limit, search, categoryId } = req.query;

  console.log('[tv-service] getMovies is waking up the transcoder...');
  get(`${Config.TranscoderUrl}/transcoder/ping`).catch(e => console.warn(`[tv-service] getMovies unable to wake the transcoder up`));

  const off: number = offset || 0;
  const page: number = Math.floor(offset / Config.Tmdb.PageSize) + 1;
  // TODO support for offset and limit (fetch two pages at a time)
  const { count, movies } = await fetchTmdbMovieList(categoryId, search, page);

  res.json({
    count,
    items: movies,
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
  const categories = await fetchTmdbMovieCategories();
  res.json({
		items: categories,
	});
};

export const getMovieStreamUrl = async (req, res) => {
  const { movieId } = req.params;
  const streamUrl = await fetchStreamUrl(movieId);

  res.json({
    id: movieId,
    streamUrl,
  });
};

const fetchStreamUrl = async (movieId: string) => {
  console.log(`[tv-service] fetching streamUrl for ${movieId}`);
  const tmdbMovieDetail = await fetchTmdbMovieDetail(movieId) as TmdbMovieDetailPayload;
  const year = tmdbMovieDetail.release_date ? new Date(tmdbMovieDetail.release_date).getUTCFullYear() : null;
  
  console.log(`[tv-service] attempting to find streamUrl for ${movieId} in the vod sources`);
  let streamUrl = await findMovieStreamUrl(tmdbMovieDetail.title, year);

  if (!streamUrl) {
    console.log(`[tv-service] movie ${tmdbMovieDetail.title} isn't available in the vod sources, attempt to get a magnet`)
    streamUrl = await findMovieMagnetUrl(tmdbMovieDetail.title, year);
  } 

  if (!streamUrl) {
    console.log(`[tv-service] unable to find a stream url for the movie ${tmdbMovieDetail.title}`);
    streamUrl = null;
  }

  return streamUrl;
};

const fetchMovieDetail = async (movieId: string): Promise<MovieDetail> => {
  const tmdbMovieDetail = await fetchTmdbMovieDetail(movieId) as TmdbMovieDetailPayload;

  const movieHeader = mapTmdbMovieHeader(tmdbMovieDetail);
  const genres = tmdbMovieDetail.genres.map(g => g.name).join(' | ');

  const tmdbYoutubeTrailer = tmdbMovieDetail.videos.results.find(rs => 
    rs.type && rs.site && 
    rs.type.toLowerCase() === Config.Tmdb.TypeTrailer.toLowerCase() && 
    rs.site.toLowerCase() === Config.Tmdb.SiteYoutube.toLowerCase()
  );

  const youtubeTrailer = tmdbYoutubeTrailer ? (Config.YoutubeUrlPrefix + tmdbYoutubeTrailer.key) : null;

  return {
    ...movieHeader,
    genres,
    overview: tmdbMovieDetail.overview,
    youtubeTrailer, 
  };
};

const mapTmdbMovieHeader = (payload: TmdbMovieHeaderPayload): MovieHeader => {
  return {
    id: payload.id,
    movieName: payload.title,
    logoUrl: `${Config.Tmdb.ImageEndpoint}/w185/${payload.poster_path}`,
    rating: Number(payload.vote_average),
    year: new Date(payload.release_date).getUTCFullYear(),
  };
}

const findMovieStreamUrl = async (movieTitle: string, year: number): Promise<string> => {
  if (!cache.movieSources) {
    console.log(`[tv-service] refreshing cached movies sources`);
    cache.movieSources = await get(Config.GoogleSheetActions.GetSources);
  }

  console.log(`[tv-service] calling GetChannelGroups...`);
   
  let vodStream: VodPayload = null;
  let source: SourcePayload = null;

  for (const sourceId of Object.keys(cache.movieSources)) {
    source = cache.movieSources[sourceId] as SourcePayload;

    vodStream = source.vodStreams.find(vs => {
      if (Number(vs.year) === year && (movieTitle.indexOf(vs.name) !== -1 || vs.name.indexOf(movieTitle) !== -1)) {
        return true;
      } else if (vs.name.toLowerCase() === movieTitle.toLowerCase()){
        return true;
      } else {
        return false;
      }
    });

    if (vodStream) {
      break;
    }
  }

  if (!vodStream) {
    return null;
  }

  const streamUrl: string[] = [
    `${source.serverUrl}`,
    `/movie`,
    `/${source.userInfo.username}`,
    `/${source.userInfo.password}`,
    `/${vodStream.stream_id}.${vodStream.container_extension}`,
  ];

  const streamUrlParts: string[] = [ Config.TranscoderUrl,
    `/transcoder/vod/`,
    encodeURIComponent(streamUrl.join('')),
    `/${Config.ProxyServicePort}`,
  ];

  return streamUrlParts.join('');
};

const findMovieMagnetUrl  = async (title: string, year: number): Promise<string> => {
  // TODO enhance the query
  const query = title;
  const movieTitle: string = query.toLowerCase();

  TorrentSearchApi.enableProvider('torrent9');

  const searchTorrent = async (q) => {
    const searchResults = await TorrentSearchApi.search(q, 'All', 5);
    return searchResults.filter(result => 
      result.title && result.title.toLowerCase().indexOf(movieTitle) !== -1
    );
  }

  let torrents = await searchTorrent(movieTitle + ' 1080');

  if (torrents.length === 0) {
    console.log(`[transcoder] movie search query: ${query}, high quality not found`);
    torrents = await searchTorrent(movieTitle);
  } else {
    console.log(`[transcoder] movie search query: ${query}, found high quality torrent ${torrents.length}` + torrents.length);
  }

  if (torrents.length === 0) {
    console.log(`[transcoder] movie search query: ${query}, no results found`);
    return null;
  } 

  const magnetUrl: string = await TorrentSearchApi.getMagnet(torrents[0]);

  const streamUrlParts: string[] = [
    Config.TranscoderUrl,
    `/transcoder/torrent/`,
    encodeURIComponent(magnetUrl),
    `/${Config.ProxyServicePort}`,
  ];
  
  return streamUrlParts.join('');
}

const fetchTmdbMovieCategories = async (): Promise<MovieCategory[]> => {
  const uri = [
    `${Config.Tmdb.Endpoint}/genre/movie/list?`,
    `api_key=${Config.Tmdb.ApiKey}`,
  ].join('');

  console.log(`[tv-service] calling tmdb ${uri}`);
  const { genres } = await get(uri) as TmdbMovieGenreListPayload;

  return genres.map(g => ({
    id: g.id,
    name: g.name,
    parentId: null,
  } as MovieCategory));
};

const fetchTmdbMovieList = async (categoryId: string, query: string, page: number): Promise<{count: number, movies: MovieHeader[]}> => {
  const api: string = query ? 'search' : 'discover';

  const uri = [
    `${Config.Tmdb.Endpoint}/${api}/movie?api_key=${Config.Tmdb.ApiKey}`,
    `&page=${page}`
  ];

  if (categoryId) {
    uri.push(`&with_genres=${categoryId}`);
  }

  if (query) {
    uri.push(`&query=${encodeURIComponent(query)}`);
  }

  console.log(`[tv-service] calling tmdb ${uri.join('')}`);
  const { results, total_results } = (await get(uri.join(''))) as TmdbDisoverMoviePayload;

  const movies = results.map(r => mapTmdbMovieHeader(r));

  return {
    count: total_results,
    movies,
  };
};

const fetchTmdbMovieDetail = async (tmdbId: string): Promise<TmdbMovieDetailPayload> => {
  const nonTranslatedUrl = [`${Config.Tmdb.Endpoint}/movie/${tmdbId}`,
    `?api_key=${Config.Tmdb.ApiKey}`,
    `&append_to_response=videos`,
  ].join('');

  console.log(`[tv-service] fetching nonTranslatedDetails movie detail for ${tmdbId}: ${nonTranslatedUrl}`);
  const nonTranslatedDetails = (await get(nonTranslatedUrl)) as TmdbMovieDetailPayload;

  const url = [`${Config.Tmdb.Endpoint}/movie/${tmdbId}`,
    `?language=${Config.Tmdb.Language}`,
    `&api_key=${Config.Tmdb.ApiKey}`,
    `&append_to_response=videos`,
  ].join('');

  console.log(`[tv-service] fetching tmdb movie detail ${url}`);
  const translatedDetails = (await get(url)) as TmdbMovieDetailPayload;

  for (const prop in translatedDetails) {
    if (!translatedDetails[prop] && nonTranslatedDetails[prop]) {
      translatedDetails[prop] = nonTranslatedDetails[prop];
    }
  }

  if (translatedDetails.videos.results.length === 0) {
    console.log(`[tv-service] unable to find videos for ${tmdbId} ${translatedDetails.title}, falling back to the nonTranslatedDetails`);
    translatedDetails.videos = nonTranslatedDetails.videos;
  }

  return translatedDetails;
};

