
export type DataPoint = {
  timestamp: number;
  [key: string]: any;
};

export type ProcessedDataPoint = {
  timestamp: number;
  type: 'single' | 'aggregate';
  stats?: {
    [metric: string]: {
      min: number;
      max: number;
      avg: number;
      count: number;
    }
  }
  [key: string]: any;
}

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
  fileName: string;
};

export type HourlyAnalysis = {
  hour: number;
  avgCurrent: number;
  avgSOC: number;
};

export type BatteryAnalysis = {
  hourlyAverages: HourlyAnalysis[];
  dayOverDayTrend: string;
}

export type TimeSensitiveInfo = {
  recommendation: string;
  voltageDifferenceOk: boolean;
  solarChargingEstimate: number | null;
  generatorSuggestion: string | null;
  estimatedRuntimeHours: number | null;
  remainingCapacity: number | null;
};

export type StateAnalysis = {
  requiresAttention: boolean;
  info: TimeSensitiveInfo | null;
  timestamp: number;
};

export type BatteryData = {
  history: DataPoint[];
  rawExtractions: ExtractionResult[];
  chartInfo: ChartInfo | null;
  processedFileNames?: string[];
  analysis?: StateAnalysis;
}

export type BatteryDataMap = Record<string, BatteryData>;

export type ImageFileStatus = 'queued' | 'processing' | 'success' | 'error' | 'duplicate';

export type ImageFile = {
  id: string;
  preview: string;
  name: string;
  status: ImageFileStatus;
  error?: string;
  verifiedMetrics?: { [key: string]: boolean };
};
