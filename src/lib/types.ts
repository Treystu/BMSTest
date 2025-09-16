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
  timestamp: number;
};

export type BatteryData = {
  history: DataPoint[];
  chartInfo: ChartInfo | null;
}

export type BatteryDataMap = Record<string, BatteryData>;
