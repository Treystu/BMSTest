"use client";

import { useState, useRef, useTransition } from 'react';
import Image from 'next/image';
import { Upload, X, Loader2, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { processImage } from '@/app/actions';
import type { ExtractionResult } from '@/lib/types';

type ImageFile = {
    preview: string;
    name: string;
}

type ImageUploaderProps = {
  onNewDataPoint: (result: ExtractionResult) => void;
  setIsLoading: (isLoading: boolean) => void;
  isLoading: boolean;
};

export function ImageUploader({ onNewDataPoint, setIsLoading, isLoading }: ImageUploaderProps) {
  const [imageFiles, setImageFiles] = useState<ImageFile[]>([]);
  const [progress, setProgress] = useState(0);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      if (imageFiles.length + files.length > 20) {
        toast({
          title: 'Too many files',
          description: 'You can upload a maximum of 20 files at a time.',
          variant: 'destructive',
        });
        return;
      }

      const newFiles: ImageFile[] = [];
      for (const file of Array.from(files)) {
        const reader = new FileReader();
        reader.onloadend = () => {
          newFiles.push({ preview: reader.result as string, name: file.name });
          if (newFiles.length === files.length) {
            setImageFiles(prev => [...prev, ...newFiles].slice(0, 20));
          }
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleClearImage = (index: number) => {
    setImageFiles(files => files.filter((_, i) => i !== index));
    if (fileInputRef.current) {
        const dt = new DataTransfer();
        const remainingFiles = Array.from(fileInputRef.current.files!).filter((_,i) => i !== index);
        remainingFiles.forEach(file => dt.items.add(file));
        fileInputRef.current.files = dt.files;
    }
  };
  
  const handleClearAll = () => {
    setImageFiles([]);
    if (fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  }

  const handleSubmit = () => {
    if (imageFiles.length === 0) {
      toast({
        title: 'No Images Selected',
        description: 'Please select one or more image files to extract data from.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    setProgress(0);
    startTransition(async () => {
      let successfulExtractions = 0;
      let failedExtractions = 0;

      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        console.log(`[ImageUploader] Processing image ${i + 1}/${imageFiles.length}: ${file.name}`);
        const result = await processImage(file.preview, file.name);

        if (result.success && result.data) {
          onNewDataPoint(result.data);
          successfulExtractions++;
          console.log(`[ImageUploader] Success for ${file.name}`);
        } else {
          failedExtractions++;
          console.error(`[ImageUploader] Failure for ${file.name}:`, result.error);
        }
        setProgress(((i + 1) / imageFiles.length) * 100);
      }
      
      toast({
        title: 'Data Extraction Complete',
        description: `${successfulExtractions} out of ${imageFiles.length} images processed. ${failedExtractions > 0 ? `${failedExtractions} failed.` : ''}`,
        variant: failedExtractions > 0 ? 'destructive' : 'default',
      });
      
      handleClearAll();
      setIsLoading(false);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>1. Upload Images</CardTitle>
        <CardDescription>Upload up to 20 images. The app will automatically identify the battery and sort the data.</CardDescription>
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
              <Upload className="mx-auto h-12 w-12" />
              <p className="mt-2 text-sm">Click button below to upload images</p>
            </div>
          )}
        </div>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept="image/png, image/jpeg, image/webp"
          multiple
        />
        <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={handleUploadClick} variant="outline" className="w-full" disabled={isLoading || isPending}>
              <Upload className="mr-2 h-4 w-4" />
              Choose Images
            </Button>
            <Button onClick={handleClearAll} variant="ghost" disabled={isLoading || isPending || imageFiles.length === 0}>
                <Trash2 className="mr-2 h-4 w-4" /> Clear
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
      </CardContent>
    </Card>
  );
}
