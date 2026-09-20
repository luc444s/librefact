import { type ReactNode, useEffect, useRef, useState } from "react";
import { BarcodeFormat, BrowserMultiFormatOneDReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";
import { Button } from "@systutor/shell/ui/button";

type BarcodeScannerModalProps = {
  open: boolean;
  title: string;
  onDetected: (barcode: string) => void;
  onClose: () => void;
  continuous?: boolean;
  preview?: ReactNode;
};

function cameraSupportError() {
  if (!window.isSecureContext) {
    return "La cámara requiere HTTPS o localhost. Abre el POS con un túnel HTTPS, Vite HTTPS local o un dominio seguro.";
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return "Este navegador no permite acceder a la cámara. Prueba con Chrome/Safari actualizado en HTTPS.";
  }
  return null;
}

function cameraStartError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
      return "Permiso de cámara denegado. Activa el permiso del navegador y vuelve a intentar.";
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "No se encontró una cámara disponible en este dispositivo.";
    }
  }
  return "No se pudo iniciar la cámara. Verifica HTTPS, permisos y que otra app no esté usando la cámara.";
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path d="M5 12.5 9.5 17 19 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

export function BarcodeScannerModal({ open, title, onDetected, onClose, continuous = false, preview }: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastDetectedRef = useRef<{ barcode: string; at: number } | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function stopCamera(updateState = true) {
    controlsRef.current?.stop();
    controlsRef.current = null;
    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (updateState) setIsScanning(false);
  }

  async function startScan() {
    const supportError = cameraSupportError();
    if (supportError) {
      setError(supportError);
      return;
    }
    if (!videoRef.current) return;

    setError(null);
    setIsScanning(true);
    try {
      const reader = new BrowserMultiFormatOneDReader();
      reader.possibleFormats = [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
      ];
      const controls = await reader.decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
          audio: false,
        },
        videoRef.current,
        (result, _error, controls) => {
          const text = result?.getText().trim();
          if (!text) return;
          if (continuous) {
            const now = Date.now();
            const last = lastDetectedRef.current;
            if (last?.barcode === text && now - last.at < 1500) return;
            lastDetectedRef.current = { barcode: text, at: now };
            onDetected(text);
            return;
          }
          controls.stop();
          stopCamera();
          onDetected(text);
        }
      );
      controlsRef.current = controls;
    } catch (err) {
      stopCamera();
      setError(cameraStartError(err));
    }
  }

  useEffect(() => {
    if (!open) {
      stopCamera();
      lastDetectedRef.current = null;
      return undefined;
    }
    void startScan();
    return () => stopCamera(false);
  }, [open]);

  if (!open) return null;

  function close() {
    stopCamera();
    setError(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 grid bg-background text-foreground">
      <div className="relative grid min-h-0 grid-rows-[auto_1fr_auto]">
        <header className="flex items-center justify-between gap-3 border-b border-border bg-card/95 p-4 shadow-card">
          <div>
            <h2 className="text-base font-black">{title}</h2>
            <p className="text-xs text-muted-foreground">Apunta la cámara al código EAN/UPC del producto.</p>
          </div>
        </header>

        <main className="relative min-h-0 bg-black">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
          {!isScanning ? (
            <div className="absolute inset-0 grid place-items-center bg-black/60 p-6 text-center text-white">
              <div className="grid max-w-sm gap-3">
                <p className="text-sm">Iniciando cámara...</p>
                {error ? <p className="rounded-xl bg-destructive/90 p-3 text-sm font-semibold">{error}</p> : null}
              </div>
            </div>
          ) : null}
          <div className="pointer-events-none absolute inset-x-4 top-1/2 h-40 -translate-y-1/2 rounded-3xl border-2 border-primary/90 shadow-[0_0_0_999px_rgba(0,0,0,0.25)]" />
          {preview ? <div className="absolute inset-x-3 bottom-3">{preview}</div> : null}
        </main>

        <footer className="grid gap-2 border-t border-border bg-card/95 p-4">
          <Button
            type="button"
            aria-label="Cerrar escáner"
            title="Cerrar escáner"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={close}
          >
            <CheckIcon />
          </Button>
        </footer>
      </div>
    </div>
  );
}
