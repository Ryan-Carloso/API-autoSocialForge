export type GroupConfig = {
  name: string;
  accountIds: number[];
  contentPath: string;
};

export type SelectedItem = {
  id?: string | number;
  title?: string;
  contentText?: string;
  raw: unknown;
};

export type SlideContent = {
  id: number;
  title: string;
  subtitle?: string;
  bullets?: string[];
};

export type CarouselContent = {
  slides: SlideContent[];
  theme?: {
    backgroundColor?: string;
    textColor?: string;
    accentColor?: string;
  };
};

export type GeneratedResult = {
  images: string[];
  metadata: {
    group: string;
    selected: SelectedItem;
    carousel: CarouselContent;
    createdAt: string;
    outputDir: string;
    filenames: string[];
  };
};

export type RenderOptions = {
  marginLeft: number;
  marginRight: number;
  fontSize: number;
  marginTop: number;
  marginBottom: number;
  fontFile: string;
  textColor: string;
  letterSpacing: number;
  fontWeight: number;
  fontStyle: string;
  fontName: string;
  paragraphSpacing: number;
};
