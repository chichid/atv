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
  streamUrl: string;
  logoUrl: string;
  rating: number;
  category: MovieCategory;
}

export interface MovieCategory {
  id: string;
  name: string;
  parentId: string;
}

export interface SourcePayload {
  serverUrl: string;
  vodCategories: VodCategoryPayload[];
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

