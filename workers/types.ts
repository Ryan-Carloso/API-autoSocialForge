import { GroupConfig, SelectedItem, CarouselContent, GeneratedResult } from '../IMAGE/modules/types';

export interface BaseJobData {
  group: GroupConfig;
  hour: number;
  isVideoBatch: boolean;
}

export interface GenerateContentData extends BaseJobData {}

export interface CreateMediaData extends BaseJobData {
  selected: SelectedItem;
  carousel: CarouselContent;
  prompt: string;
}

export interface UploadSupabaseData extends BaseJobData {
  selected: SelectedItem;
  carousel: CarouselContent;
  prompt: string;
  outputDir: string;
  filenames: string[];
}

export interface SchedulePostData extends BaseJobData {
  result: GeneratedResult;
  mediaIds: string[];
  caption: string;
  scheduledAt: string;
  prompt: string;
}

export interface DailyBatchData {
  group: GroupConfig;
}
