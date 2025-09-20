
"use client";

import React, { useState, useRef, useTransition, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, CheckCircle, XCircle, Loader, Download, AlertTriangle, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { extractDataWithFunctionCallingFromImageBatch } from '@/ai/actions';
import type { DataPoint, ExtractionResult, BatteryDataMap, ImageFile, ImageFileStatus } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"


const MAX_FILES = 20;
const MAX_SIZE_MB = 10;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

const fileStatusIcons: { [key in ImageFileStatus]: React.ReactElement } = {
  queued: <UploadCloud className="h-5 w-5 text-gray-500" />,
  processing: <Loader className="h-5 w-5 animate-spin text-blue-500" />,
  success: <CheckCircle className="h-5 w-5 text-green-500" />,
  error: <XCircle className="h-5 w-5 text-red-500" />,
  duplicate: <AlertTriangle className="h-5 w-5 text-yellow-500" />
};

const readFileAsDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const processZipFile = async (zipFile: File): Promise<ImageFile[]> => {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(zipFile);
    const imageFiles: ImageFile[] = [];
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp'];

    for (const relativePath in zip.files) {
        const zipEntry = zip.files[relativePath];
        if (!zipEntry.dir && imageExtensions.some(ext => relativePath.toLowerCase().endsWith(ext))) {
            const blob = await zipEntry.async('blob');
            const file = new File([blob], zipEntry.name, { type: blob.type });
            const preview = await readFileAsDataURL(file);
            imageFiles.push({
                id: `${zipEntry.name}-${zipEntry.date.getTime()}`,
                preview,
                name: zipEntry.name,
                status: 'queued'
            });
        }
    }
    return imageFiles;
};



export function ImageUploader({ 
    onNewDataPoint, 
    onMultipleDataPoints,
    setIsLoading, 
    isLoading,
    dataByBattery,
    processedFileNames
}: {
    onNewDataPoint: (data: ExtractionResult) => void;
    onMultipleDataPoints: (data: BatteryDataMap) => void;
    setIsLoading: (isLoading: boolean) => void;
    isLoading: boolean;
    dataByBattery: BatteryDataMap;
    processedFileNames: Set<string>;
}) {
  const [imageFiles, setImageFiles] = useState<ImageFile[]>([]);
  const [progress, setProgress] = useState(0);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const [duplicateFiles, setDuplicateFiles] = useState<{ newFiles: ImageFile[], existingNames: string[] } | null>(null);
  const { toast } = useToast();

  const handleFileSelection = async (files: FileList | null) => {
    if (!files) return;

    let newFiles: ImageFile[] = [];
    const processingPromises: Promise<ImageFile[] | ImageFile>[]= [];

    for (const file of Array.from(files)) {
        if (file.type === 'application/zip') {
            processingPromises.push(processZipFile(file));
        } else {
            const promise = readFileAsDataURL(file).then(preview => ({
                id: `${file.name}-${file.lastModified}`,
                preview,
                name: file.name,
                status: 'queued' as ImageFileStatus
            }));
            processingPromises.push(promise);
        }
    }

    const results = await Promise.all(processingPromises);
    newFiles = results.flat();

    const uniqueNewFiles = newFiles.filter(nf => !imageFiles.some(ef => ef.id === nf.id));
    
    const duplicates = uniqueNewFiles.filter(f => processedFileNames.has(f.name));

    if (duplicates.length > 0) {
        setDuplicateFiles({ newFiles: uniqueNewFiles, existingNames: duplicates.map(f => f.name) });
    } else {
        addFilesToQueue(uniqueNewFiles);
    }
  };

  const addFilesToQueue = (files: ImageFile[]) => {
    const updatedFiles = [...imageFiles, ...files].slice(0, MAX_FILES);
    setImageFiles(updatedFiles);
  };
  
  const handleProcessFiles = () => {
    const filesToProcess = imageFiles.filter(f => f.status === 'queued');
    if (filesToProcess.length > 0) {
        startTransition(async () => {
          await processFiles(filesToProcess);
        });
    }
  }

  const processFiles = async (filesToProcess: ImageFile[]) => {
    setIsLoading(true);
    setProgress(0);

    const updateFileStatus = (id: string, status: ImageFileStatus, error?: string) => {
      setImageFiles(prev => prev.map(f => f.id === id ? { ...f, status, error } : f));
    };
    
    filesToProcess.forEach(f => updateFileStatus(f.id, 'processing'));

    try {
        const imageBlobs = await Promise.all(filesToProcess.map(async (file) => {
            const response = await fetch(file.preview);
            return { id: file.id, name: file.name, blob: await response.blob() };
        }));

        const result = await extractDataWithFunctionCallingFromImageBatch(imageBlobs);
        
        if (result.success) {
            result.extractions.forEach((extraction, index) => {
                if (extraction.success && extraction.data) {
                    onNewDataPoint(extraction.data);
                    updateFileStatus(extraction.imageId, 'success');
                } else {
                    updateFileStatus(extraction.imageId, 'error', extraction.error);
                }
                setProgress(prev => prev + (index + 1) * (100 / filesToProcess.length));
            });
        } else {
            toast({ title: 'Batch Processing Error', description: result.error, variant: 'destructive' });
            filesToProcess.forEach(f => updateFileStatus(f.id, 'error', result.error));
        }
    } catch (e: any) {
        toast({ title: 'Image Processing Failed', description: e.message || 'An unexpected error occurred.', variant: 'destructive' });
        filesToProcess.forEach(f => updateFileStatus(f.id, 'error', e.message));
        console.error("Upload failed", e);
    } finally {
        setIsLoading(false);
        setProgress(100);
    }
  };
  
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleJsonUploadClick = () => {
    jsonInputRef.current?.click();
  };
  
  const handleClear = () => {
    setImageFiles([]);
    setProgress(0);
  };

  const handleDownload = () => {
    if (Object.keys(dataByBattery).length === 0) {
        toast({ title: "No Data", description: "There is no data to download.", variant: "destructive" });
        return;
    }

    const dataToExport = { ...dataByBattery };
    Object.keys(dataToExport).forEach(batteryId => {
        if (dataToExport[batteryId].history) {
            dataToExport[batteryId].history = dataToExport[batteryId].history.slice(-500); // Limit history to last 500 points
        }
        if (dataToExport[batteryId].rawExtractions) {
            dataToExport[batteryId].rawExtractions = dataToExport[batteryId].rawExtractions.slice(-100); // Limit raw extractions
        }
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
            if (typeof text !== 'string') {
                throw new Error("File is not a valid text file.");
            }
            const data = JSON.parse(text) as BatteryDataMap;
            
            // Basic validation
            if (typeof data !== 'object' || data === null) throw new Error("Invalid JSON structure");

            onMultipleDataPoints(data);
            
            toast({ title: "JSON Data Loaded", description: `Successfully imported data for ${Object.keys(data).length} batteries.` });
        } catch (error: any) {
            toast({ title: "JSON Read Error", description: error.message, variant: "destructive" });
        }
    };
    reader.onerror = () => {
        toast({ title: "File Read Error", description: "Could not read the selected file.", variant: "destructive" });
    }
    reader.readAsText(file);

    // Reset file input
    event.target.value = '';
  };
  
  const queuedFilesCount = imageFiles.filter(f => f.status === 'queued').length;

  return (
    <>
        <Card className="w-full max-w-2xl mx-auto">
            <CardHeader>
                <CardTitle>Data Uploader</CardTitle>
                <CardDescription>Upload images, ZIP archives, or JSON data files. Your data is processed locally.</CardDescription>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="images">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="images">Images & ZIPs</TabsTrigger>
                        <TabsTrigger value="data">Data Import/Export</TabsTrigger>
                    </TabsList>
                    <TabsContent value="images">
                        <div className="mt-4 space-y-4">
                            <div className="w-full p-6 border-2 border-dashed rounded-lg text-center cursor-pointer hover:bg-muted/50" onClick={handleUploadClick}>
                                <Upload className="mx-auto h-12 w-12 text-gray-400" />
                                <p className="mt-2 text-sm text-muted-foreground">Click to upload or drag and drop</p>
                                <p className="text-xs text-muted-foreground">PNG, JPG, WEBP, or ZIP (max {MAX_FILES} files, {MAX_SIZE_MB}MB each)</p>
                            </div>
                            {imageFiles.length > 0 && (
                                <div className="space-y-2">
                                    <AnimatePresence>
                                        {imageFiles.map(file => (
                                            <motion.div
                                                key={file.id}
                                                layout
                                                initial={{ opacity: 0, y: -10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, x: -20 }}
                                                className="flex items-center space-x-3 p-2 bg-muted/50 rounded-lg"
                                            >
                                                <img src={file.preview} alt={file.name} className="h-10 w-10 rounded-md object-cover" />
                                                <div className="flex-1">
                                                    <p className="text-sm font-medium truncate">{file.name}</p>
                                                    {file.status === 'error' && <p className="text-xs text-red-500">{file.error}</p>}
                                                </div>
                                                {fileStatusIcons[file.status]}
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                    {isLoading && <Progress value={progress} className="w-full h-2 mt-2" />}
                                </div>
                            )}
                            {(imageFiles.length > 0 || isLoading) && (
                                <div className="flex justify-end space-x-2">
                                    <Button onClick={handleClear} variant="ghost" disabled={isLoading}>Clear</Button>
                                    {queuedFilesCount > 0 && 
                                        <Button onClick={handleProcessFiles} disabled={isLoading || isPending}>
                                            {isPending ? 'Starting...' : `Upload ${queuedFilesCount} File(s)`}
                                        </Button>
                                    }
                                </div>
                            )}
                        </div>
                    </TabsContent>
                    <TabsContent value="data">
                         <div className="mt-4 space-y-4 text-center">
                             <FileText className="mx-auto h-12 w-12 text-gray-400" />
                            <p className="text-sm text-muted-foreground">Import data from a previous session or export your current data.</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                                <Button onClick={handleJsonUploadClick} variant="default" className="w-full" disabled={isLoading || isPending}>
                                  <UploadCloud className="mr-2 h-4 w-4" />
                                  Import from JSON
                                </Button>
                                <Button onClick={handleDownload} variant="secondary" className="w-full" disabled={isLoading || isPending || Object.keys(dataByBattery).length === 0}>
                                  <Download className="mr-2 h-4 w-4" />
                                  Export to JSON
                                </Button>
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>


            </CardContent>
        </Card>

        <input type="file" ref={fileInputRef} onChange={(e) => handleFileSelection(e.target.files)} className="hidden" accept="image/png, image/jpeg, image/webp, application/zip" multiple />
        <input type="file" ref={jsonInputRef} onChange={handleJsonFileChange} className="hidden" accept="application/json" />

        <AlertDialog open={!!duplicateFiles} onOpenChange={(open) => !open && setDuplicateFiles(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Duplicate Files Detected</AlertDialogTitle>
                    <AlertDialogDescription>
                        You have selected {duplicateFiles?.newFiles.length} file(s), but {duplicateFiles?.existingNames.length} of them appear to have been processed already:
                         <ul className="list-disc list-inside mt-2 text-sm text-muted-foreground bg-muted/30 p-2 rounded-md">
                            {duplicateFiles?.existingNames.map(name => <li key={name}>{name}</li>)}
                        </ul>
                        Do you want to re-process them anyway? 
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => {
                        const nonDuplicates = duplicateFiles?.newFiles.filter(f => !duplicateFiles.existingNames.includes(f.name));
                        if (nonDuplicates && nonDuplicates.length > 0) addFilesToQueue(nonDuplicates);
                        setDuplicateFiles(null);
                    }}>Skip Duplicates</AlertDialogCancel>
                    <AlertDialogAction onClick={() => {
                        if (duplicateFiles) addFilesToQueue(duplicateFiles.newFiles);
                        setDuplicateFiles(null);
                    }}>Process All</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </>
  );
}
