export interface Group {
	groupName: string,
  channels: Channel[],	
}

export interface Channel {
	id: string,
	name: string,
  logoUrl: string,
	streamUrl: string,
	timeshiftUrl: string,
	epgShift: number,
	epgDisplayShift: number,
	epgPrograms?: EpgProgram[],
}

export interface EpgProgram {
	key: string,
	programTitle: string,
	programSummary: string,
	day: string,
	start: string,
	end: string,
	duration: number,
	streamUrl: string,
}

export interface ChannelGroupPayload {
  groupName: string,
  channels: ChannelPayload[],
}
 
export interface ChannelPayload {
  Channel: string,
  LogoUrl: string,
  StreamUrl: string,
  TimeshiftUrl: string,
  EpgShift: string,
  EpgDisplayShift: string,
}

export interface MovieHeader {
  id: string;
  movieName: string;
  logoUrl: string;
  rating: number;
  year: number;
}

export interface MovieDetail extends MovieHeader {
  genres: string;
  overview: string;
  youtubeTrailer: string;
}

export interface MovieCategory {
  id: string;
  name: string;
  parentId: string;
}

export interface SourcePayload {
  sourceId: string;
  serverUrl: string;
  vodCategories: VodCategoryPayload[];
  vodStreams: VodPayload[];
  serverInfo: {
    protocol: string; 
  };
  userInfo: {
    username: string;
    password: string;
  };
}

export interface VodPayload {
  name: string;
  year: string;
  language: string;
  stream_icon: string;
  rating: string;
  category_id: string;
  container_extension: string;
  stream_type: string;
  stream_id: string;
  genre: string;
}

export interface VodCategoryPayload {
  category_id: string;
  category_name: string;
  parent_id: string;
}

export interface TmdbMovieGenreListPayload {
  genres: [{
    id: string,
    name: string,
  }];
}

export interface TmdbMovieHeaderPayload {
  id: string;
  original_title: string;
  title: string;
  overview: string;
  poster_path: string;
  vote_average: string;
  release_date: string;
}

export interface TmdbDisoverMoviePayload {
  total_results: number;
  results: TmdbMovieHeaderPayload[];
} 

export interface TmdbMovieDetailPayload extends TmdbMovieHeaderPayload {
  genres: {
    id: string;
    name: string;
  }[];

  videos: {
    results: {
      id: string,
      key: string,
      site: string,
      type: string,
    }[];
  }
}

