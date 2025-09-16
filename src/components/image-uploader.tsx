"use client";

import { useState, useRef, useTransition } from 'react';
import Image from 'next/image';
import { Upload, X, Loader2, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { processImage } from '@/app/actions';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"


type ImageUploaderProps = {
  onDataExtracted: (batteryId: string, data: { extractedData: string }[]) => void;
  setIsLoading: (isLoading: boolean) => void;
  activeBatteryId: string;
  setActiveBatteryId: (id: string) => void;
  batteryIds: string[];
};

export function ImageUploader({ onDataExtracted, setIsLoading, activeBatteryId, setActiveBatteryId, batteryIds }: ImageUploaderProps) {
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      if (files.length > 10) {
        toast({
          title: 'Too many files',
          description: 'You can upload a maximum of 10 files at a time.',
          variant: 'destructive',
        });
        return;
      }

      const newPreviews: string[] = [];
      for (const file of Array.from(files)) {
        const reader = new FileReader();
        reader.onloadend = () => {
          newPreviews.push(reader.result as string);
          if (newPreviews.length === files.length) {
            setImagePreviews(prev => [...prev, ...newPreviews].slice(0, 10));
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
    setImagePreviews(previews => previews.filter((_, i) => i !== index));
  };
  
  const handleClearAll = () => {
    setImagePreviews([]);
    if (fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  }

  const handleSubmit = () => {
    if (imagePreviews.length === 0) {
      toast({
        title: 'No Images Selected',
        description: 'Please select one or more image files to extract data from.',
        variant: 'destructive',
      });
      return;
    }
    if (!activeBatteryId) {
      toast({
        title: 'No Battery ID',
        description: 'Please enter or select a battery ID.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    startTransition(async () => {
      const results = await Promise.all(imagePreviews.map(preview => processImage(preview)));
      
      const successfulExtractions = results.filter(r => r.success).map(r => r.data!);
      const failedExtractions = results.filter(r => !r.success);

      if (successfulExtractions.length > 0) {
        onDataExtracted(activeBatteryId, successfulExtractions);
        toast({
          title: 'Data Extraction Complete',
          description: `${successfulExtractions.length} out of ${results.length} images processed successfully.`,
        });
      }

      if (failedExtractions.length > 0) {
        toast({
          title: 'Some Extractions Failed',
          description: `${failedExtractions.length} images could not be processed.`,
          variant: 'destructive',
        });
      }
      
      handleClearAll();
      setIsLoading(false);
    });
  };
  
  const isLoading = isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>1. Upload Images</CardTitle>
        <CardDescription>Upload up to 10 images for a specific battery.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-2">
            <Label htmlFor="batteryId">Battery Identifier</Label>
            <div className="flex gap-2">
                <Input 
                    id="batteryId"
                    placeholder="Enter new or select existing ID"
                    value={activeBatteryId}
                    onChange={(e) => setActiveBatteryId(e.target.value)}
                    className="w-full"
                />
                <Select onValueChange={setActiveBatteryId} value={activeBatteryId} >
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Existing" />
                    </SelectTrigger>
                    <SelectContent>
                        {batteryIds.map(id => (
                            <SelectItem key={id} value={id}>{id}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>

        <div className="relative w-full border-2 border-dashed rounded-lg flex items-center justify-center bg-muted/50 overflow-hidden p-2 min-h-[150px]">
          {imagePreviews.length > 0 ? (
             <div className="grid grid-cols-3 md:grid-cols-5 gap-2 w-full">
                {imagePreviews.map((preview, index) => (
                    <div key={index} className="relative aspect-square">
                        <Image
                            src={preview}
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
            <Button onClick={handleUploadClick} variant="outline" className="w-full">
              <Upload className="mr-2 h-4 w-4" />
              Choose Images
            </Button>
            <Button onClick={handleClearAll} variant="ghost" disabled={imagePreviews.length === 0}>
                <Trash2 className="mr-2 h-4 w-4" /> Clear
            </Button>
        </div>
         <Button onClick={handleSubmit} disabled={isLoading || imagePreviews.length === 0 || !activeBatteryId} className="w-full">
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {isLoading ? `Extracting ${imagePreviews.length} images...` : `Extract Data from ${imagePreviews.length} Images`}
        </Button>
      </CardContent>
    </Card>
  );
}
