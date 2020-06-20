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
