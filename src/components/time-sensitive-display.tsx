
import {
    Card, CardContent, CardHeader, CardTitle, CardDescription
} from '@/components/ui/card';
import type { StateAnalysis } from '@/lib/types';
import {
    AlertCircle, Zap, Thermometer, Info, BatteryCharging, BatteryWarning
} from 'lucide-react';

const formatRuntime = (hours: number | null): string => {
    if (hours === null) return 'N/A';
    if (hours < 0) return 'Charging';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
};

const MetricDisplay = ({ icon: Icon, label, value, unit, isBad, isGood }: any) => (
    <div className="flex items-center space-x-3 p-3 rounded-lg bg-background">
        <Icon className={`h-6 w-6 ${isBad ? 'text-destructive' : isGood ? 'text-green-500' : 'text-muted-foreground'}`} />
        <div className="flex flex-col">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className={`text-lg font-bold ${isBad ? 'text-destructive' : ''}`}>
                {value} <span className="text-sm font-normal text-muted-foreground">{unit}</span>
            </p>
        </div>
    </div>
);

const Recommendation = ({ text, icon: Icon, type }: any) => (
    <div className={`mt-4 p-4 rounded-lg flex items-start space-x-3 ${type === 'destructive' ? 'bg-destructive/10 border-destructive/30' : 'bg-secondary/50 border-secondary/30'} border`}>
        <Icon className={`h-5 w-5 mt-1 ${type === 'destructive' ? 'text-destructive' : 'text-foreground'}`} />
        <p className="text-sm">{text}</p>
    </div>
);


export function TimeSensitiveDisplay({ analysis }: { analysis: StateAnalysis | null }) {
    if (!analysis || !analysis.info) return null;

    const { requiresAttention, info, timestamp } = analysis;
    const { 
        estimatedRuntimeHours, remainingCapacity, soc, current, 
        voltageDifference, tempMos, generatorSuggestion, recommendation 
    } = info;

    if (Date.now() - timestamp > 6 * 60 * 60 * 1000) return null;

    return (
        <Card className={requiresAttention ? 'border-destructive' : 'border-primary/20'}>
            <CardHeader>
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle className={`flex items-center space-x-2 ${requiresAttention ? 'text-destructive' : ''}`}>
                            {requiresAttention ? <AlertCircle /> : <Info />}
                            <span>Real-Time Battery Analysis</span>
                        </CardTitle>
                        <CardDescription>Generated: {new Date(timestamp).toLocaleString()}</CardDescription>
                    </div>
                    {requiresAttention && <span className="text-xs font-bold uppercase text-destructive bg-destructive/10 px-2 py-1 rounded-full">Attention</span>}
                </div>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <MetricDisplay 
                        icon={BatteryCharging} 
                        label="Est. Runtime" 
                        value={formatRuntime(estimatedRuntimeHours)} 
                        isBad={estimatedRuntimeHours !== null && estimatedRuntimeHours < 4}
                    />
                    <MetricDisplay 
                        icon={BatteryWarning} 
                        label="Rem. Capacity" 
                        value={remainingCapacity?.toFixed(2) ?? 'N/A'} 
                        unit="Ah"
                    />
                    <MetricDisplay 
                        icon={Zap} 
                        label="Current" 
                        value={current?.toFixed(2) ?? 'N/A'} 
                        unit="A" 
                        isGood={current && current > 1}
                    />
                    <MetricDisplay 
                        icon={AlertCircle} 
                        label="V. Difference" 
                        value={voltageDifference?.toFixed(3) ?? 'N/A'} 
                        unit="V" 
                        isBad={!info.voltageDifferenceOk}
                    />
                    <MetricDisplay 
                        icon={Thermometer} 
                        label="MOS Temp" 
                        value={tempMos?.toFixed(1) ?? 'N/A'} 
                        unit="°C" 
                        isBad={tempMos && tempMos > 60}
                    />
                    <MetricDisplay 
                        icon={Info} 
                        label="SoC" 
                        value={soc?.toFixed(1) ?? 'N/A'} 
                        unit="%"
                        isBad={soc && soc < 25}
                    />
                </div>

                {recommendation && 
                    <Recommendation text={recommendation} icon={Info} type="default" />
                }
                
                {generatorSuggestion && 
                    <Recommendation text={generatorSuggestion} icon={AlertCircle} type="destructive" />
                }

            </CardContent>
        </Card>
    );
}
