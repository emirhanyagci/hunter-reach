'use client';
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { csvApi } from '@/lib/api';
import { Button } from '@/components/ui/button';

interface UploadResult {
  importId: string;
  filename: string;
  totalRows: number;
  addedRows: number;
  duplicatesSkipped: number;
  invalidRows: number;
  columnNames: string[];
}

interface CsvUploadZoneProps {
  onSuccess?: (result: UploadResult) => void;
}

export function CsvUploadZone({ onSuccess }: CsvUploadZoneProps) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const data = await csvApi.upload(file);
      setResult(data);
      onSuccess?.(data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [onSuccess]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'text/plain': ['.txt'] },
    maxFiles: 1,
    disabled: uploading,
  });

  if (result) {
    return (
      <div className="rounded-xl border-2 border-green-200 bg-green-50 p-8 text-center dark:border-green-800 dark:bg-green-950">
        <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-green-500" />
        <h3 className="text-lg font-semibold text-green-800 dark:text-green-200">Import Complete</h3>
        <p className="mt-1 text-sm text-green-700 dark:text-green-300">{result.filename}</p>
        <div className="mt-4 flex justify-center gap-6 text-sm">
          <div className="text-center">
            <p className="text-2xl font-bold text-green-800 dark:text-green-200">{result.addedRows}</p>
            <p className="text-green-600 dark:text-green-400">Added</p>
          </div>
          {result.duplicatesSkipped > 0 && (
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-600">{result.duplicatesSkipped}</p>
              <p className="text-amber-500">Duplicates skipped</p>
            </div>
          )}
          {result.invalidRows > 0 && (
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600">{result.invalidRows}</p>
              <p className="text-red-500">Invalid rows</p>
            </div>
          )}
          <div className="text-center">
            <p className="text-2xl font-bold text-muted-foreground">{result.totalRows}</p>
            <p className="text-muted-foreground">Total rows</p>
          </div>
        </div>
        {result.duplicatesSkipped > 0 && (
          <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
            {result.duplicatesSkipped} contact{result.duplicatesSkipped !== 1 ? 's' : ''} already existed and were not re-added.
          </p>
        )}
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => setResult(null)}
        >
          Upload another file
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div
        {...getRootProps()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 text-center transition-all duration-200',
          isDragActive
            ? 'border-primary bg-primary/5 scale-[1.01]'
            : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-accent/50',
          uploading && 'pointer-events-none opacity-70',
        )}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <>
            <Loader2 className="mb-4 h-12 w-12 animate-spin text-primary" />
            <p className="text-lg font-medium">Parsing your CSV...</p>
            <p className="mt-1 text-sm text-muted-foreground">This may take a moment for large files</p>
          </>
        ) : isDragActive ? (
          <>
            <Upload className="mb-4 h-12 w-12 text-primary" />
            <p className="text-lg font-semibold text-primary">Drop it here!</p>
          </>
        ) : (
          <>
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <FileText className="h-8 w-8 text-primary" />
            </div>
            <p className="text-lg font-semibold">Drop your Hunter.io CSV here</p>
            <p className="mt-1 text-sm text-muted-foreground">or click to browse files</p>
            <p className="mt-3 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
              .csv files up to 10MB
            </p>
          </>
        )}
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
