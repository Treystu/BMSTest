"use client";

import { useState, useRef, useTransition, useCallback } from 'react';
import Image from 'next/image';
import { Upload, X, Loader2, Trash2, Download, UploadCloud, AlertCircle, CheckCircle, RefreshCw, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { processImage } from '@/app/actions';
import type { ExtractionResult, BatteryDataMap, ImageFile } from '@/lib/types';
import JSZip from 'jszip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

type ImageUploaderProps = {
  onNewDataPoint: (result: ExtractionResult) => void;
  onMultipleDataPoints: (data: BatteryDataMap) => void;
  setIsLoading: (isLoading: boolean) => void;
  isLoading: boolean;
  dataByBattery: BatteryDataMap;
};

const isImageFile = (fileName: string) => {
    return /\.(jpe?g|png|webp)$/i.test(fileName);
};

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
    dataByBattery
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
      if (file.type === 'application/zip') {
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
                    const file = new File([blob], zipEntry.name, { type: blob.type });
                    newRawFiles.push({ file, name: zipEntry.name });
                }
            }
        } catch (error) {
            console.error("Error unzipping file:", error);
toast({ title: "ZIP File Error", description: "There was an error processing the ZIP file.", variant: 'destructive' });
            return;
        }
    }
    
    const fileToImageFile = (file: File): Promise<ImageFile> => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                resolve({ 
                    id: `${file.name}-${new Date().getTime()}`,
                    preview: reader.result as string, 
                    name: file.name,
                    status: 'queued' 
                });
            };
            reader.readAsDataURL(file);
        });
    };

    const newImageFilePromises = newRawFiles.map(f => fileToImageFile(f.file));
    const newImageFiles = await Promise.all(newImageFilePromises);
    
    const existingNames = imageFiles.map(f => f.name);
    const duplicates = newImageFiles.filter(f => existingNames.includes(f.name));

    if (duplicates.length > 0) {
        setDuplicateFiles({ newFiles: newImageFiles, existingNames });
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
    setImageFiles(prev => prev.map(f => f.status === 'error' ? { ...f, status: 'queued', error: undefined } : f));
    toast({ title: "Re-submitted", description: "Failed uploads have been re-queued for processing." });
  };


  const handleDownloadData = () => {
    if (Object.keys(dataByBattery).length === 0) {
      toast({ title: "No Data to Download", description: "Upload and process some images first.", variant: "destructive" });
      return;
    }

    const dataStr = JSON.stringify(dataByBattery, null, 2);
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
      let successfulExtractions = 0;
      let failedExtractions = 0;
      
      const updateFileStatus = (id: string, status: ImageFile['status'], error?: string) => {
        setImageFiles(prev => prev.map(f => f.id === id ? { ...f, status, error } : f));
      };

      for (let i = 0; i < filesToProcess.length; i++) {
        const file = filesToProcess[i];
        console.log(`[ImageUploader] Processing image ${i + 1}/${filesToProcess.length}: ${file.name}`);
        updateFileStatus(file.id, 'processing');
        try {
            const result = await processImage(file.preview, file.name);

            if (result.success && result.data) {
              onNewDataPoint(result.data);
              successfulExtractions++;
              updateFileStatus(file.id, 'success');
              console.log(`[ImageUploader] Success for ${file.name}`);
            } else {
              failedExtractions++;
              updateFileStatus(file.id, 'error', result.error);
              console.error(`[ImageUploader] Failure for ${file.name}:`, result.error);
            }
        } catch (e: any) {
            failedExtractions++;
            updateFileStatus(file.id, 'error', e.message);
            console.error(`[ImageUploader] Critical Failure for ${file.name}:`, e);
        }
        setProgress(((i + 1) / filesToProcess.length) * 100);
      }
      
      toast({
        title: 'Data Extraction Complete',
        description: `${successfulExtractions} out of ${filesToProcess.length} images processed. ${failedExtractions > 0 ? `${failedExtractions} failed.` : ''}`,
        variant: failedExtractions > 0 ? 'destructive' : 'default',
      });
      
      setIsLoading(false);
    });
  };

  const hasFailedUploads = imageFiles.some(f => f.status === 'error');

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>1. Upload Data</CardTitle>
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
