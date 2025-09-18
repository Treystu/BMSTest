
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { StateAnalysis } from '@/lib/types';

type TimeSensitiveDisplayProps = {
  analysis: StateAnalysis | null;
};

export function TimeSensitiveDisplay({ analysis }: TimeSensitiveDisplayProps) {
  if (!analysis || !analysis.info) {
    return null;
  }

  const { requiresAttention, info, timestamp } = analysis;
  const sixHours = 6 * 60 * 60 * 1000;

  if (Date.now() - timestamp > sixHours) {
    return null;
  }

  return (
    <Card className={requiresAttention ? 'border-destructive' : ''}>
      <CardHeader>
        <CardTitle
          className={requiresAttention ? 'text-destructive' : ''}
        >
          Time-Sensitive Analysis
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-48 w-full rounded-md border bg-muted/20 p-4">
          <div className="text-sm">
            <p className="font-bold">Recommendation:</p>
            <p>{info.recommendation}</p>
            <br />
            <p className="font-bold">Voltage Difference:</p>
            <p>{info.voltageDifferenceOk ? 'OK' : 'High'}</p>
            <br />
            {info.solarChargingEstimate !== null && (
              <>
                <p className="font-bold">Solar Charging Estimate:</p>
                <p>{info.solarChargingEstimate} amps</p>
                <br />
              </>
            )}
            {info.generatorSuggestion && (
              <>
                <p className="font-bold">Generator Suggestion:</p>
                <p>{info.generatorSuggestion}</p>
              </>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
