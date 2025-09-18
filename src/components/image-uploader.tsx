
"use client";

import { useState, useRef, useTransition, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { Upload, X, Loader2, Trash2, Download, UploadCloud, AlertCircle, CheckCircle, RefreshCw, Clock, Check, ShieldCheck, Copy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { processImage } from '@/app/actions';
import type { ExtractionResult, BatteryDataMap, ImageFile } from '@/lib/types';
import JSZip from 'jszip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { ScrollArea } from './ui/scroll-area';

type ImageUploaderProps = {
  onNewDataPoint: (result: ExtractionResult) => void;
  onMultipleDataPoints: (data: BatteryDataMap) => void;
  setIsLoading: (isLoading: boolean) => void;
  isLoading: boolean;
  dataByBattery: BatteryDataMap;
  processedFileNames: Set<string>;
};

const isImageFile = (fileName: string) => {
    return /\.(jpe?g|png|webp)$/i.test(fileName);
};

const coreMetrics = ['soc', 'voltage', 'current', 'capacity'];

const StatusIcon = ({ status, error }: { status: ImageFile['status'], error?: string }) => {
    let icon;
    let tooltipText;
    let className;

    switch (status) {
        case 'queued':
            icon = <Clock className="h-3 w-3" />;
            tooltipText = 'Queued';
            className = 'bg-gray-400';
            break;
        case 'processing':
            icon = <Loader2 className="h-3 w-3 animate-spin" />;
            tooltipText = 'Processing...';
            className = 'bg-blue-500';
            break;
        case 'success':
            icon = <CheckCircle className="h-3 w-3" />;
            tooltipText = 'Success';
            className = 'bg-green-500';
            break;
        case 'duplicate':
            icon = <Copy className="h-3 w-3" />;
            tooltipText = 'Duplicate file name, already processed.';
            className = 'bg-yellow-500';
            break;
        case 'error':
            icon = <AlertCircle className="h-3 w-3" />;
            tooltipText = `Error: ${error || 'Unknown error'}`;
            className = 'bg-red-500';
            break;
    }

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className={`absolute bottom-1 right-1 z-10 h-5 w-5 rounded-full flex items-center justify-center text-white ${className}`}>
                        {icon}
                    </div>
                </TooltipTrigger>
                <TooltipContent>
                    <p>{tooltipText}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
};


export function ImageUploader({ 
    onNewDataPoint, 
    onMultipleDataPoints,
    setIsLoading, 
    isLoading,
    dataByBattery,
    processedFileNames
}: ImageUploaderProps) {
  const [imageFiles, setImageFiles] = useState<ImageFile[]>([]);
  const [progress, setProgress] = useState(0);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const [duplicateFiles, setDuplicateFiles] = useState<{ newFiles: ImageFile[], existingNames: string[] } | null>(null);
  const { toast } = useToast();

  const handleFileSelection = async (files: FileList | null) => {
    if (!files) return;

    let newRawFiles: { file: File, name: string }[] = [];
    let zipFile: File | null = null;
    
    for (const file of Array.from(files)) {
      if (file.type === 'application/zip' || file.name.endsWith('.zip')) {
        zipFile = file;
        break; 
      }
      if (file.type.startsWith('image/')) {
        newRawFiles.push({ file, name: file.name });
      }
    }
    
    if (zipFile) {
        try {
            const zip = await JSZip.loadAsync(zipFile);
            for (const relativePath in zip.files) {
                const zipEntry = zip.files[relativePath];
                if (!zipEntry.dir && isImageFile(zipEntry.name)) {
                    const blob = await zipEntry.async('blob');
                    const imageType = blob.type === 'application/octet-stream' ? 'image/png' : blob.type;
                    const file = new File([blob], relativePath, { type: imageType });
                    newRawFiles.push({ file, name: relativePath });
                }
            }
        } catch (error) {
            console.error("Error unzipping file:", error);
            toast({ title: "ZIP File Error", description: "There was an error processing the ZIP file.", variant: 'destructive' });
            return;
        }
    }
    
    const fileToImageFile = (file: File, name: string): Promise<ImageFile> => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                let dataUri = reader.result as string;
                if (dataUri.startsWith('data:application/octet-stream')) {
                  dataUri = dataUri.replace('data:application/octet-stream', 'data:image/png');
                }
                const status: ImageFile['status'] = processedFileNames.has(name) ? 'duplicate' : 'queued';
                resolve({ 
                    id: `${name}-${new Date().getTime()}`,
                    preview: dataUri,
                    name: name,
                    status: status
                });
            };
            reader.readAsDataURL(file);
        });
    };

    const newImageFilePromises = newRawFiles.map(f => fileToImageFile(f.file, f.name));
    const newImageFiles = await Promise.all(newImageFilePromises);
    
    const currentQueueNames = imageFiles.map(f => f.name);
    const duplicatesInQueue = newImageFiles.filter(f => currentQueueNames.includes(f.name));

    if (duplicatesInQueue.length > 0) {
        setDuplicateFiles({ newFiles: newImageFiles, existingNames: currentQueueNames });
    } else {
        addFilesToQueue(newImageFiles);
    }
    
    if(fileInputRef.current) fileInputRef.current.value = "";
  };
  
  const addFilesToQueue = (filesToAdd: ImageFile[]) => {
      setImageFiles(prev => [...prev, ...filesToAdd]);
  };

  const handleDuplicateConfirmation = (confirm: boolean) => {
    if (confirm && duplicateFiles) {
        addFilesToQueue(duplicateFiles.newFiles);
    } else if (duplicateFiles) {
        const nonDuplicates = duplicateFiles.newFiles.filter(f => !duplicateFiles.existingNames.includes(f.name));
        addFilesToQueue(nonDuplicates);
    }
    setDuplicateFiles(null);
  };


  const handleUploadClick = () => { fileInputRef.current?.click(); };
  const handleJsonUploadClick = () => { jsonInputRef.current?.click(); };

  const handleClearImage = (id: string) => {
    setImageFiles(files => files.filter(f => f.id !== id));
  };
  
  const handleClearAll = () => {
    setImageFiles([]);
  }

  const handleResubmitFailed = () => {
    setImageFiles(prev => prev.map(f => {
        if (f.status === 'error') {
            const newStatus: ImageFile['status'] = processedFileNames.has(f.name) ? 'duplicate' : 'queued';
            return { ...f, status: newStatus, error: undefined };
        }
        return f;
    }));
    toast({ title: "Re-submitted", description: "Failed uploads have been re-queued for processing." });
  };


  const handleDownloadData = () => {
    if (Object.keys(dataByBattery).length === 0) {
      toast({ title: "No Data to Download", description: "Upload and process some images first.", variant: "destructive" });
      return;
    }
    
    const dataToExport = JSON.parse(JSON.stringify(dataByBattery));

    const allFileNames = Array.from(processedFileNames);
    Object.keys(dataToExport).forEach(batteryId => {
        dataToExport[batteryId].processedFileNames = allFileNames;
    });

    const dataStr = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `insight-extractor-data-${new Date().toISOString()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast({ title: "Data Downloaded", description: "Your extracted data has been saved as a JSON file." });
  };

  const handleJsonFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') { throw new Error("File could not be read."); }
        const parsedData = JSON.parse(text);
        if (typeof parsedData !== 'object' || parsedData === null) { throw new Error("Invalid JSON format."); }
        onMultipleDataPoints(parsedData);
        toast({ title: "Data Imported Successfully", description: "The data from your JSON file has been loaded." });
      } catch (error: any) {
        toast({ title: "Failed to Import Data", description: `Error reading JSON file: ${error.message}`, variant: "destructive", });
      }
    };
    reader.readAsText(file);
    if (jsonInputRef.current) jsonInputRef.current.value = "";
  };


  const handleSubmit = () => {
    const filesToProcess = imageFiles.filter(f => f.status === 'queued');
    if (filesToProcess.length === 0) {
        toast({ title: 'No New Images to Process', description: 'Please select images or re-submit failed ones.', variant: 'destructive' });
        return;
    }

    setIsLoading(true);
    setProgress(0);

    startTransition(async () => {
        const totalFiles = filesToProcess.length;
        let processedCount = 0;
        let successfulExtractions = 0;
        let failedExtractions = 0;

        let concurrency = 5;
        const maxConcurrency = 15;
        const minConcurrency = 2;

        const updateFileStatus = (id: string, status: ImageFile['status'], data?: { error?: string, verifiedMetrics?: { [key: string]: boolean } }) => {
            setImageFiles(prev => prev.map(f => f.id === id ? { ...f, status, ...data } : f));
        };

        const processQueue = async () => {
            const queue = [...filesToProcess];
            let activePromises = 0;

            return new Promise<void>((resolve) => {
                const executeNext = async () => {
                    if (queue.length === 0 && activePromises === 0) {
                        resolve();
                        return;
                    }
                    while (activePromises < concurrency && queue.length > 0) {
                        const file = queue.shift();
                        if (!file) continue;

                        activePromises++;
                        
                        updateFileStatus(file.id, 'processing');
                        console.log(`[ImageUploader] Processing image: ${file.name}. Concurrency: ${concurrency}`);

                        processImage(file.preview, file.name)
                            .then(result => {
                                if (result.success && result.data) {
                                    onNewDataPoint(result.data);
                                    successfulExtractions++;
                                    
                                    const verifiedMetrics: { [key: string]: boolean } = {};
                                    try {
                                        const parsedData = JSON.parse(result.data.extractedData);
                                        const extractedKeys = Object.keys(parsedData).map(k => k.toLowerCase());
                                        coreMetrics.forEach(coreMetric => {
                                            verifiedMetrics[coreMetric] = extractedKeys.some(ek => ek.includes(coreMetric) && parsedData[ek] !== null);
                                        });
                                    } catch {
                                        coreMetrics.forEach(coreMetric => { verifiedMetrics[coreMetric] = false; });
                                    }
                                    updateFileStatus(file.id, 'success', { verifiedMetrics });
                                    
                                    concurrency = Math.min(maxConcurrency, concurrency + 1);

                                } else {
                                    failedExtractions++;
                                    updateFileStatus(file.id, 'error', { error: result.error });

                                    concurrency = Math.max(minConcurrency, Math.floor(concurrency / 2));
                                }
                            })
                            .catch(e => {
                                failedExtractions++;
                                updateFileStatus(file.id, 'error', { error: e.message });
                                
                                concurrency = Math.max(minConcurrency, Math.floor(concurrency / 2));
                            })
                            .finally(() => {
                                activePromises--;
                                processedCount++;
                                setProgress((processedCount / totalFiles) * 100);
                                executeNext();
                            });
                    }
                };
                for(let i=0; i<concurrency; i++){
                    executeNext();
                }
            });
        };

        await processQueue();
        
        toast({
            title: 'Data Extraction Complete',
            description: `${successfulExtractions} out of ${totalFiles} images processed. ${failedExtractions > 0 ? `${failedExtractions} failed.` : ''}`,
            variant: failedExtractions > 0 ? 'destructive' : 'default',
        });
        
        setIsLoading(false);
    });
};


  const hasFailedUploads = imageFiles.some(f => f.status === 'error');
  const hasProcessedFiles = imageFiles.some(f => f.status !== 'queued' && f.status !== 'processing');

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>Upload Data</CardTitle>
        <CardDescription>Upload images/ZIP to extract data, or upload a previously saved JSON data file.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="relative w-full border-2 border-dashed rounded-lg flex items-center justify-center bg-muted/50 overflow-hidden p-2 min-h-[150px]">
          {imageFiles.length > 0 ? (
             <div className="grid grid-cols-3 md:grid-cols-5 gap-2 w-full">
                {imageFiles.map((file) => (
                    <div key={file.id} className="relative aspect-square">
                        <Image
                            src={file.preview}
                            alt={`Image preview ${file.name}`}
                            fill
                            className="object-contain rounded-md"
                        />
                        <Button
                            variant="destructive"
                            size="icon"
                            className="absolute top-1 right-1 z-10 h-6 w-6"
                            onClick={() => handleClearImage(file.id)}
                            disabled={isLoading}
                        >
                            <X className="h-3 w-3" />
                            <span className="sr-only">Clear image</span>
                        </Button>
                        <StatusIcon status={file.status} error={file.error} />
                    </div>
                ))}
             </div>
          ) : (
            <div className="text-center text-muted-foreground p-4">
              <UploadCloud className="mx-auto h-12 w-12" />
              <p className="mt-2 text-sm">Choose images, a ZIP file, or upload a JSON file</p>
            </div>
          )}
        </div>
        <input type="file" ref={fileInputRef} onChange={(e) => handleFileSelection(e.target.files)} className="hidden" accept="image/png, image/jpeg, image/webp, application/zip" multiple />
        <input type="file" ref={jsonInputRef} onChange={handleJsonFileChange} className="hidden" accept="application/json" />
        
        <div className="grid grid-cols-2 gap-2">
            <Button onClick={handleUploadClick} variant="outline" className="w-full" disabled={isLoading || isPending}>
              <Upload className="mr-2 h-4 w-4" />
              Images / ZIP
            </Button>
            <Button onClick={handleJsonUploadClick} variant="outline" className="w-full" disabled={isLoading || isPending}>
              <UploadCloud className="mr-2 h-4 w-4" />
              Upload JSON
            </Button>
        </div>
         <Button onClick={handleSubmit} disabled={isLoading || isPending || imageFiles.filter(f => f.status === 'queued').length === 0} className="w-full">
              {isLoading || isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isLoading || isPending ? `Extracting...` : `Extract Data from ${imageFiles.filter(f => f.status === 'queued').length} New Images`}
        </Button>
        {(isLoading || isPending) && (
            <div className="space-y-2">
                <Progress value={progress} />
                <p className="text-sm text-muted-foreground text-center">Processing... {Math.round(progress)}%</p>
            </div>
        )}
        <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={handleDownloadData} variant="secondary" className="w-full" disabled={isLoading || isPending || Object.keys(dataByBattery).length === 0}>
                <Download className="mr-2 h-4 w-4" /> Download Data as JSON
            </Button>
            {hasFailedUploads && (
                <Button onClick={handleResubmitFailed} variant="outline" className="w-full" disabled={isLoading || isPending}>
                    <RefreshCw className="mr-2 h-4 w-4" /> Re-submit Failed
                </Button>
            )}
            <Button onClick={handleClearAll} variant="ghost" disabled={isLoading || isPending || imageFiles.length === 0}>
                <Trash2 className="mr-2 h-4 w-4" /> Clear All
            </Button>
        </div>
        {hasProcessedFiles && (
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="verification">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5" />
                  <span className="font-semibold">Verification Details</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <ScrollArea className="h-64 w-full">
                  <div className="p-1 space-y-2">
                    {imageFiles.filter(f => f.status !== 'queued' && f.status !== 'processing').map(file => (
                      <div key={file.id} className="text-sm p-2 rounded-md bg-muted/50">
                        <p className="font-semibold truncate" title={file.name}>{file.name}</p>
                        {file.status === 'success' ? (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
                            {coreMetrics.map(metric => (
                              <div key={metric} className="flex items-center gap-1">
                                {file.verifiedMetrics?.[metric] ? 
                                  <Check className="h-4 w-4 text-green-600" /> : 
                                  <X className="h-4 w-4 text-red-600" />
                                }
                                <span className="capitalize">{metric}</span>
                              </div>
                            ))}
                          </div>
                        ) : file.status === 'duplicate' ? (
                            <p className="text-yellow-600 mt-1">Skipped: Duplicate file.</p>
                        ) : (
                          <p className="text-red-600 mt-1">Failed: {file.error}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </CardContent>
    </Card>
    {duplicateFiles && (
        <AlertDialog open={!!duplicateFiles} onOpenChange={() => setDuplicateFiles(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Duplicate Files Detected</AlertDialogTitle>
                    <AlertDialogDescription>
                        You have selected files that are already in the upload queue. Do you want to add these duplicates anyway?
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => handleDuplicateConfirmation(false)}>Ignore Duplicates</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDuplicateConfirmation(true)}>Add Anyway</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )}
    </>
  );
}
