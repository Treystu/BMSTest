import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { DataPoint } from '@/lib/types';

type DataDisplayProps = {
  data: DataPoint | null;
};

export function DataDisplay({ data }: DataDisplayProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>2. Extracted Data</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-48 w-full rounded-md border bg-muted/20 p-4">
          {data ? (
            <pre className="text-sm">
              <code>{JSON.stringify(data, null, 2)}</code>
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground p-4 text-center">
              Upload an image to see extracted data here.
            </p>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
