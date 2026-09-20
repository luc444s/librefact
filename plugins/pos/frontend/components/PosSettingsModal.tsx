import { Button } from "@systutor/shell/ui/button";
import { Dialog } from "@systutor/shell/ui/dialog";
import { Input } from "@systutor/shell/ui/input";

type PosSettingsModalProps = {
  open: boolean;
  title: string;
  qrImage: string;
  onTitleChange: (value: string) => void;
  onQrImageChange: (value: string) => void;
  onClose: () => void;
};

export function PosSettingsModal({
  open,
  title,
  qrImage,
  onTitleChange,
  onQrImageChange,
  onClose,
}: PosSettingsModalProps) {
  function handleQrFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") onQrImageChange(reader.result);
    };
    reader.readAsDataURL(file);
  }

  return (
    <Dialog
      open={open}
      title="Ajustes POS"
      description="Configuración simple para la caja actual."
      onClose={onClose}
      maxWidthClassName="max-w-md"
      zIndexClassName="z-[1000]"
    >
      <div className="grid gap-4">
        <label className="grid gap-1 text-sm">
          <span className="font-semibold text-muted-foreground">Título visible</span>
          <Input value={title} onChange={(event) => onTitleChange(event.target.value)} placeholder="Bodega Express" />
        </label>

        <div className="grid gap-2 rounded-2xl border border-border bg-card p-3">
          <div>
            <strong className="block text-sm text-card-foreground">QR Yape, Plin y similares</strong>
            <span className="text-xs text-muted-foreground">Sube una imagen cuadrada para mostrarla al cobrar.</span>
          </div>

          {qrImage ? (
            <img
              src={qrImage}
              alt="QR configurado para pagos móviles"
              className="mx-auto h-40 w-40 rounded-xl border border-border object-contain"
            />
          ) : (
            <div className="mx-auto grid h-40 w-40 place-items-center rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground">
              Sin QR
            </div>
          )}

          <label className="inline-flex items-center justify-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted">
            Subir QR
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => handleQrFile(event.target.files?.[0])}
            />
          </label>

          {qrImage ? (
            <Button type="button" variant="secondary" onClick={() => onQrImageChange("")}>
              Quitar QR
            </Button>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
