"use client";

import { useState, useRef, useTransition } from 'react';
import Image from 'next/image';
import { Upload, X, Loader2, Trash2, Download, UploadCloud } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { processImage } from '@/app/actions';
import type { ExtractionResult, BatteryDataMap } from '@/lib/types';
import JSZip from 'jszip';

type ImageFile = {
    preview: string;
    name: string;
}

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
  const { toast } = useToast();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    let newFiles: ImageFile[] = [];
    let zipFile: File | null = null;
    
    for (const file of Array.from(files)) {
      if (file.type === 'application/zip') {
        zipFile = file;
        break; 
      }
      if (file.type.startsWith('image/')) {
        newFiles.push(file as unknown as ImageFile);
      }
    }
    
    if (zipFile) {
        try {
            const zip = await JSZip.loadAsync(zipFile);
            const imagePromises: Promise<ImageFile>[] = [];
            
            zip.forEach((relativePath, zipEntry) => {
                if (!zipEntry.dir && isImageFile(zipEntry.name)) {
                    const imagePromise = zipEntry.async('base64').then(base64 => {
                        const mimeType = zipEntry.name.endsWith('.png') ? 'image/png' : 'image/jpeg';
                        return {
                            preview: `data:${mimeType};base64,${base64}`,
                            name: zipEntry.name
                        };
                    });
                    imagePromises.push(imagePromise);
                }
            });

            const unzippedImages = await Promise.all(imagePromises);
            newFiles.push(...unzippedImages);
        } catch (error) {
            console.error("Error unzipping file:", error);
            toast({
                title: "ZIP File Error",
                description: "There was an error processing the ZIP file.",
                variant: 'destructive'
            });
            return;
        }
    }
    
    if(newFiles.some(f => !f.preview)){ // This means we have File objects not ImageFile objects
        const filePromises = newFiles.map(file => {
            return new Promise<ImageFile>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    resolve({ preview: reader.result as string, name: (file as unknown as File).name });
                };
                reader.readAsDataURL(file as unknown as File);
            })
        })
        const loadedFiles = await Promise.all(filePromises);
        setImageFiles(prev => [...prev, ...loadedFiles]);

    } else {
        setImageFiles(prev => [...prev, ...newFiles]);
    }
    
    if(fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };
  
  const handleJsonUploadClick = () => {
    jsonInputRef.current?.click();
  }

  const handleClearImage = (index: number) => {
    setImageFiles(files => files.filter((_, i) => i !== index));
  };
  
  const handleClearAll = () => {
    setImageFiles([]);
  }

  const handleDownloadData = () => {
    if (Object.keys(dataByBattery).length === 0) {
      toast({
        title: "No Data to Download",
        description: "Upload and process some images first.",
        variant: "destructive"
      });
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
    
    toast({
        title: "Data Downloaded",
        description: "Your extracted data has been saved as a JSON file."
    });
  };

  const handleJsonFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') {
          throw new Error("File could not be read.");
        }
        const parsedData = JSON.parse(text);
        
        // Basic validation
        if (typeof parsedData !== 'object' || parsedData === null) {
            throw new Error("Invalid JSON format.");
        }
        
        onMultipleDataPoints(parsedData);

        toast({
          title: "Data Imported Successfully",
          description: "The data from your JSON file has been loaded.",
        });

      } catch (error: any) {
        toast({
          title: "Failed to Import Data",
          description: `Error reading JSON file: ${error.message}`,
          variant: "destructive",
        });
      }
    };
    reader.readAsText(file);

    if (jsonInputRef.current) jsonInputRef.current.value = "";
  };


  const handleSubmit = () => {
    if (imageFiles.length === 0) {
      toast({
        title: 'No Images Selected',
        description: 'Please select one or more image files (or a ZIP) to extract data from.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    setProgress(0);
    startTransition(async () => {
      let successfulExtractions = 0;
      let failedExtractions = 0;
      const totalImages = imageFiles.length;

      for (let i = 0; i < totalImages; i++) {
        const file = imageFiles[i];
        console.log(`[ImageUploader] Processing image ${i + 1}/${totalImages}: ${file.name}`);
        try {
            const result = await processImage(file.preview, file.name);

            if (result.success && result.data) {
              onNewDataPoint(result.data);
              successfulExtractions++;
              console.log(`[ImageUploader] Success for ${file.name}`);
            } else {
              failedExtractions++;
              console.error(`[ImageUploader] Failure for ${file.name}:`, result.error);
            }
        } catch (e) {
            failedExtractions++;
            console.error(`[ImageUploader] Critical Failure for ${file.name}:`, e);
        }
        setProgress(((i + 1) / totalImages) * 100);
      }
      
      toast({
        title: 'Data Extraction Complete',
        description: `${successfulExtractions} out of ${totalImages} images processed. ${failedExtractions > 0 ? `${failedExtractions} failed.` : ''}`,
        variant: failedExtractions > 0 ? 'destructive' : 'default',
      });
      
      handleClearAll();
      setIsLoading(false);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>1. Upload Data</CardTitle>
        <CardDescription>Upload images/ZIP to extract data, or upload a previously saved JSON data file.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="relative w-full border-2 border-dashed rounded-lg flex items-center justify-center bg-muted/50 overflow-hidden p-2 min-h-[150px]">
          {imageFiles.length > 0 ? (
             <div className="grid grid-cols-3 md:grid-cols-5 gap-2 w-full">
                {imageFiles.map((file, index) => (
                    <div key={index} className="relative aspect-square">
                        <Image
                            src={file.preview}
                            alt={`Image preview ${index + 1}`}
                            fill
                            className="object-contain rounded-md"
                        />
                        <Button
                            variant="destructive"
                            size="icon"
                            className="absolute top-1 right-1 z-10 h-6 w-6"
                            onClick={() => handleClearImage(index)}
                        >
                            <X className="h-3 w-3" />
                            <span className="sr-only">Clear image</span>
                        </Button>
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
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept="image/png, image/jpeg, image/webp, application/zip"
          multiple
        />
        <input
            type="file"
            ref={jsonInputRef}
            onChange={handleJsonFileChange}
            className="hidden"
            accept="application/json"
        />
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
         <Button onClick={handleSubmit} disabled={isLoading || isPending || imageFiles.length === 0} className="w-full">
              {isLoading || isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {isLoading || isPending ? `Extracting ${imageFiles.length} images...` : `Extract Data from ${imageFiles.length} Images`}
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
            <Button onClick={handleClearAll} variant="ghost" disabled={isLoading || isPending || imageFiles.length === 0}>
                <Trash2 className="mr-2 h-4 w-4" /> Clear Images
            </Button>
        </div>
      </CardContent>
    </Card>
  );
}
