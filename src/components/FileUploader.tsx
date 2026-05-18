import * as React from 'react';
import { Upload, FileCheck, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface FileUploaderProps {
  label: string;
  onFileSelect: (file: File | null) => void;
  selectedFile: File | null;
  id: string;
}

export function FileUploader({ label, onFileSelect, selectedFile, id }: FileUploaderProps) {
  const [isDragging, setIsDragging] = React.useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type.includes('excel') || file.type.includes('spreadsheetml') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv'))) {
      onFileSelect(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-on-surface-variant flex items-center gap-2">
        <Upload className="w-4 h-4" />
        {label}
      </label>
      
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative group border-2 border-dashed rounded-xl p-6 transition-all cursor-pointer text-center",
          isDragging ? "border-primary bg-primary/5" : "border-outline-variant bg-surface",
          selectedFile ? "border-success bg-success/5" : "hover:border-primary hover:bg-surface-container"
        )}
      >
        <input
          type="file"
          id={id}
          className="absolute inset-0 opacity-0 cursor-pointer"
          onChange={handleFileChange}
          accept=".xlsx,.xls,.csv"
        />
        
        <div className="flex flex-col items-center gap-2">
          {selectedFile ? (
            <>
              <FileCheck className="w-8 h-8 text-success" />
              <div className="text-sm font-medium text-success truncate max-w-full px-2">
                {selectedFile.name}
              </div>
              <button 
                onClick={(e) => { e.preventDefault(); onFileSelect(null); }}
                className="mt-1 text-xs text-on-surface-variant hover:text-error flex items-center gap-1"
              >
                <X className="w-3 h-3" /> 삭제
              </button>
            </>
          ) : (
            <>
              <Upload className="w-8 h-8 text-outline group-hover:text-primary transition-colors" />
              <div className="text-sm text-on-surface-variant">
                파일을 드래그하거나 클릭하세요
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
