export type DataPoint = {
  timestamp: number;
  [key: string]: any;
};

export type ChartInfo = {
  title: string;
  description: string;
};

export type SelectedMetrics = {
  [key: string]: boolean;
};

export type ExtractionResult = {
  batteryId: string;
  extractedData: string;
};
