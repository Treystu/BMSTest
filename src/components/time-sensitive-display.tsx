
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { StateAnalysis } from '@/lib/types';

type TimeSensitiveDisplayProps = {
  analysis: StateAnalysis | null;
};

const formatRuntime = (hours: number | null): string => {
  if (hours === null || hours < 0) return 'Charging';
  if (hours === 0) return 'Not available';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m`;
};

export function TimeSensitiveDisplay({ analysis }: TimeSensitiveDisplayProps) {
  if (!analysis || !analysis.info) return null;

  const { requiresAttention, info, timestamp } = analysis;
  const sixHours = 6 * 60 * 60 * 1000;

  if (Date.now() - timestamp > sixHours) return null;

  return (
    <Card className={requiresAttention ? 'border-destructive' : ''}>
      <CardHeader>
        <CardTitle className={requiresAttention ? 'text-destructive' : ''}>
          Real-Time Battery Analysis
        </CardTitle>
        <CardDescription>Generated: {new Date(timestamp).toLocaleString()}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4">
        <div className="flex flex-col space-y-1">
          <p className="text-sm font-medium text-muted-foreground">Est. Runtime</p>
          <p className="text-2xl font-bold">{formatRuntime(info.estimatedRuntimeHours)}</p>
        </div>
        <div className="flex flex-col space-y-1">
          <p className="text-sm font-medium text-muted-foreground">Rem. Capacity</p>
          <p className="text-2xl font-bold">{info.remainingCapacity?.toFixed(2) ?? 'N/A'} Ah</p>
        </div>
        <div className="col-span-2">
          <ScrollArea className="h-40 w-full rounded-md border bg-muted/20 p-4">
            <div className="text-sm space-y-3">
                <div>
                    <p className="font-bold">Recommendation</p>
                    <p className="text-muted-foreground">{info.recommendation}</p>
                </div>
                {info.generatorSuggestion && (
                    <div>
                        <p className="font-bold">Generator Suggestion</p>
                        <p className="text-muted-foreground">{info.generatorSuggestion}</p>
                    </div>
                )}
                <div>
                    <p className="font-bold">System Status</p>
                    <ul className="list-disc list-inside text-muted-foreground">
                        <li>Voltage Difference: <span className={info.voltageDifferenceOk ? '' : 'text-destructive font-bold'}>{info.voltageDifferenceOk ? 'OK' : 'High'}</span></li>
                        {info.solarChargingEstimate !== null && <li>Solar Estimate: {info.solarChargingEstimate} amps</li>}
                    </ul>
                </div>
            </div>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}
