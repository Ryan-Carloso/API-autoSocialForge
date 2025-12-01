export type ContentType = 'video' | 'carousel' | 'audio';

export interface GeneratedContent {
  type: ContentType;
  mediaPaths: string[]; // Local paths or URLs
  caption: string;
}
