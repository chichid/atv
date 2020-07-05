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

export interface Movie {
  id: string;
  movieName: string;
  sourceId: string;
  streamId: string;
  streamUrl: string;
  logoUrl: string;
  rating: number;
  category: MovieCategory;
  year: number;
}

export interface MovieDetail extends Movie {
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
}

export interface VodCategoryPayload {
  category_id: string;
  category_name: string;
  parent_id: string;
}

export interface VodInfoPayload {
  info: {
    tmdb_id: string;
    name: string;
    releasedate: string;
    description: string;
  };
}

export interface TmdbMovieDetailPayload {
  id: string;
  title: string;
  overview: string;
  release_date: string;
  videos: {
    results: {
      id: string,
      key: string,
      site: string,
      type: string,
    }[];
  }
}

export interface TmdbMovieSearchPayload {
  results: {
    id: string;
    title: string;
  }[]
}

