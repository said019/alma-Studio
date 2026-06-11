// Reemplazo de marca para window.confirm / window.prompt en el admin.
// Uso:
//   const { confirm, promptText, dialog } = useConfirm();
//   ... {dialog} en el JSX de la página ...
//   const ok = await confirm({ title: "¿Cancelar la clase?", description: "...", destructive: true });
//   const reason = await promptText({ title: "Motivo de cancelación", placeholder: "..." });
import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";

type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type PromptOptions = {
  title: string;
  description?: ReactNode;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  required?: boolean;
};

type PendingState =
  | { kind: "confirm"; opts: ConfirmOptions }
  | { kind: "prompt"; opts: PromptOptions };

export function useConfirm() {
  const [pending, setPending] = useState<PendingState | null>(null);
  const [text, setText] = useState("");
  const confirmResolver = useRef<((v: boolean) => void) | null>(null);
  const promptResolver = useRef<((v: string | null) => void) | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        confirmResolver.current = resolve;
        setPending({ kind: "confirm", opts });
      }),
    [],
  );

  const promptText = useCallback(
    (opts: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        promptResolver.current = resolve;
        setText("");
        setPending({ kind: "prompt", opts });
      }),
    [],
  );

  const settle = (accepted: boolean) => {
    if (!pending) return;
    if (pending.kind === "confirm") {
      confirmResolver.current?.(accepted);
      confirmResolver.current = null;
    } else {
      promptResolver.current?.(accepted ? text.trim() : null);
      promptResolver.current = null;
    }
    setPending(null);
  };

  const opts = pending?.opts;
  const isPrompt = pending?.kind === "prompt";
  const promptOpts = isPrompt ? (pending.opts as PromptOptions) : null;
  const confirmDisabled = isPrompt && promptOpts?.required ? text.trim().length === 0 : false;
  const destructive = !isPrompt && (pending?.opts as ConfirmOptions | undefined)?.destructive;

  const dialog = (
    <AlertDialog open={pending != null} onOpenChange={(open) => { if (!open) settle(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{opts?.title}</AlertDialogTitle>
          {opts?.description ? (
            <AlertDialogDescription>{opts.description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        {isPrompt ? (
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={promptOpts?.placeholder}
            rows={3}
            autoFocus
          />
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>
            {opts?.cancelLabel ?? "Volver"}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={confirmDisabled}
            onClick={() => settle(true)}
            className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
          >
            {opts?.confirmLabel ?? "Confirmar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, promptText, dialog };
}
