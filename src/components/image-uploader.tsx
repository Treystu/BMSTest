"use client";

import { useState, useRef, useTransition } from 'react';
import Image from 'next/image';
import { Upload, X, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { processImage } from '@/app/actions';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import type { ChartInfo } from '@/lib/types';

type ImageUploaderProps = {
  onDataExtracted: (data: { extractedData: string; chartInfo: ChartInfo }) => void;
  setIsLoading: (isLoading: boolean) => void;
};

export function ImageUploader({ onDataExtracted, setIsLoading }: ImageUploaderProps) {
  const [imagePreview, setImagePreview] = useState<string | null>(PlaceHolderImages[0]?.imageUrl || null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleClearImage = () => {
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = () => {
    if (!imagePreview) {
      toast({
        title: 'No Image Selected',
        description: 'Please select an image file to extract data from.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    startTransition(async () => {
      const result = await processImage(imagePreview);

      if (result.success && result.data) {
        onDataExtracted(result.data);
        toast({
          title: 'Data Extracted',
          description: 'New data point has been added to the chart.',
        });
      } else {
        toast({
          title: 'Extraction Failed',
          description: result.error,
          variant: 'destructive',
        });
      }
      setIsLoading(false);
    });
  };
  
  const isLoading = isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>1. Upload Image</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="relative aspect-video w-full border-2 border-dashed rounded-lg flex items-center justify-center bg-muted/50 overflow-hidden">
          {imagePreview ? (
            <>
              <Image
                src={imagePreview}
                alt="Image preview"
                fill
                className="object-contain"
                data-ai-hint={PlaceHolderImages[0]?.imageHint || "dashboard"}
              />
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2 z-10 h-8 w-8"
                onClick={handleClearImage}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Clear image</span>
              </Button>
            </>
          ) : (
            <div className="text-center text-muted-foreground p-4">
              <Upload className="mx-auto h-12 w-12" />
              <p className="mt-2 text-sm">Click button below to upload an image</p>
            </div>
          )}
        </div>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept="image/png, image/jpeg, image/webp"
        />
        <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={handleUploadClick} variant="outline" className="w-full">
              <Upload className="mr-2 h-4 w-4" />
              Choose Image
            </Button>
            <Button onClick={handleSubmit} disabled={isLoading || !imagePreview} className="w-full">
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {isLoading ? 'Extracting...' : 'Extract Data'}
            </Button>
        </div>
      </CardContent>
    </Card>
  );
}
