import React, { useRef, useState } from 'react';
import { ImageIcon, XCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../utils/cn';

interface ImageData {
  id: number;
  dataUrl: string;
  fileName: string;
  fileSize: number;
}

interface ImageUploaderProps {
  onImagesChange: (images: ImageData[]) => void;
  images: ImageData[];
  maxImages?: number;
  maxFileSize?: number; // in bytes
}

const ImageUploader: React.FC<ImageUploaderProps> = ({
  onImagesChange,
  images,
  maxImages = 5,
  maxFileSize = 5 * 1024 * 1024, // 5MB
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;

    const newImages: ImageData[] = [];
    const remainingSlots = maxImages - images.length;

    for (let i = 0; i < Math.min(files.length, remainingSlots); i++) {
      const file = files[i];

      // Check file type
      if (!file.type.startsWith('image/')) {
        alert(`文件 ${file.name} 不是图片文件`);
        continue;
      }

      // Check file size
      if (file.size > maxFileSize) {
        alert(`文件 ${file.name} 太大，最大支持 ${maxFileSize / 1024 / 1024}MB`);
        continue;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const imageData: ImageData = {
          id: Date.now() + i,
          dataUrl,
          fileName: file.name,
          fileSize: file.size,
        };
        newImages.push(imageData);

        // If this is the last image to process, update state
        if (newImages.length === Math.min(files.length, remainingSlots)) {
          onImagesChange([...images, ...newImages]);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files);
    // Reset input to allow selecting same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData.items;
    const files: File[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }

    if (files.length > 0) {
      const dataTransfer = new DataTransfer();
      files.forEach(file => dataTransfer.items.add(file));
      handleFileSelect(dataTransfer.files);
    }
  };

  const removeImage = (id: number) => {
    onImagesChange(images.filter(img => img.id !== id));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="space-y-3">
      {/* Image previews */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((image) => (
            <div
              key={image.id}
              className="relative group rounded-lg overflow-hidden border border-emerald-200 dark:border-emerald-700"
            >
              <img
                src={image.dataUrl}
                alt={image.fileName}
                className="w-20 h-20 object-cover"
              />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-1">
                <p className="text-xs text-white text-center truncate w-full">
                  {image.fileName}
                </p>
                <p className="text-xs text-emerald-200">
                  {formatFileSize(image.fileSize)}
                </p>
              </div>
              <button
                onClick={() => removeImage(image.id)}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <XCircle size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload area */}
      {images.length < maxImages && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onPaste={handlePaste}
          className={cn(
            "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
            isDragging
              ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
              : "border-emerald-300 dark:border-emerald-700 hover:border-emerald-400 dark:hover:border-emerald-600"
          )}
          onClick={() => fileInputRef.current?.click()}
          tabIndex={0}
          role="button"
          aria-label="上传图片"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileInputChange}
            className="hidden"
          />
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex flex-col items-center justify-center"
          >
            <ImageIcon className="w-8 h-8 text-emerald-500 mb-2" />
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              点击、拖放或粘贴图片
            </p>
            <p className="text-xs text-emerald-500/70 mt-1">
              支持最多 {maxImages} 张图片，每张不超过 {maxFileSize / 1024 / 1024}MB
            </p>
            <p className="text-xs text-emerald-500/50 mt-1">
              已选择 {images.length} / {maxImages} 张
            </p>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default ImageUploader;
export type { ImageData };