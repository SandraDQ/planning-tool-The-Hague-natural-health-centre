"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, Icons, RadioCardGroup, Select, Sheet, TextField } from "@/design-system";
import { CATEGORY_DEFAULT_BTW, COST_CATEGORIES } from "@/lib/books/categories";
import type { BankTransaction, BtwTreatment, CostCategory, Expense, Locale } from "@/lib/domain/types";
import { splitGross } from "@/lib/invoicing/btw";
import { centsToInput, formatEuro, parseEuroInput } from "@/features/dashboard/money";
import { useRunAction } from "@/features/dashboard/useRunAction";
import { addCostFromPayment, deleteCost, removeReceipt, saveCost } from "./actions";

export type BooksArea = "admin" | "therapist";

export type CostSheetMode =
  | { kind: "add" }
  | { kind: "edit"; expense: Expense }
  | { kind: "fromBank"; transaction: BankTransaction; category: CostCategory | null };

const RATES: BtwTreatment[] = ["21", "9", "exempt"];
const MAX_SIDE = 1800;

/**
 * Phone photos are large: shrink them in the browser to a sharp JPEG of at most 1800 px,
 * so the upload is quick. PDFs and anything the browser can't read go up as they are.
 */
async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 600_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

/** Add, change or (from a bank payment) create a cost. One sheet, the receipt photo first. */
export function CostSheet({ mode, area, today, onClose }: { mode: CostSheetMode; area: BooksArea; today: string; onClose: () => void }) {
  const t = useTranslations("books");
  const locale = useLocale() as Locale;
  const { pending, exec } = useRunAction(area);
  const fileInput = useRef<HTMLInputElement>(null);

  const existing = mode.kind === "edit" ? mode.expense : null;
  const tx = mode.kind === "fromBank" ? mode.transaction : null;
  const startCategory: CostCategory = existing?.category ?? (mode.kind === "fromBank" ? (mode.category ?? "other") : "supplies");

  const [supplier, setSupplier] = useState(existing?.supplier ?? tx?.counterparty ?? "");
  const [amount, setAmount] = useState(existing ? centsToInput(existing.grossCents) : tx ? centsToInput(-tx.amountCents) : "");
  const [date, setDate] = useState(existing?.date ?? tx?.bookedOn ?? today);
  const [category, setCategory] = useState<CostCategory>(startCategory);
  const [rate, setRate] = useState<BtwTreatment>(existing?.btwRate ?? CATEGORY_DEFAULT_BTW[startCategory]);
  const [rateTouched, setRateTouched] = useState(!!existing);
  const [description, setDescription] = useState(existing?.description ?? (tx ? tx.description : ""));
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const cents = parseEuroInput(amount);
  const errors = {
    supplier: !supplier.trim() ? t("form.supplierError") : undefined,
    amount: !cents ? t("form.amountError") : undefined,
    date: !date || date > today ? t("form.dateError") : undefined,
  };
  const valid = !errors.supplier && !errors.amount && !errors.date && !fileError;
  const btw = cents ? splitGross(cents, rate).btwCents : 0;

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    const ok = /^(image\/(jpeg|png|webp)|application\/pdf)$/.test(f.type) || /\.(jpe?g|png|webp|pdf)$/i.test(f.name);
    const shrunk = ok ? await shrinkImage(f) : f;
    setFileError(!ok || shrunk.size > 5 * 1024 * 1024);
    setFile(shrunk);
  };

  const submit = () => {
    if (!valid) {
      setShowErrors(true);
      return;
    }
    const form = new FormData();
    form.set("data", JSON.stringify({ id: existing?.id, date, supplier: supplier.trim(), description: description.trim(), category, grossCents: cents, btwRate: rate }));
    if (file) form.set("receipt", file);
    const call = tx ? () => addCostFromPayment(tx.id, form) : () => saveCost(form);
    exec<unknown>(call, { success: t("form.saved"), successText: tx ? undefined : t("form.savedText"), onSuccess: onClose });
  };

  if (confirmDelete && existing) {
    return (
      <Sheet
        open
        onClose={() => setConfirmDelete(false)}
        title={t("form.deleteTitle")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              {t("form.cancel")}
            </Button>
            <Button disabled={pending} leadingIcon={<Icons.Trash />} onClick={() => exec(() => deleteCost(existing.id), { success: t("form.deleted"), onSuccess: onClose })}>
              {t("form.deleteConfirm")}
            </Button>
          </>
        }
      >
        <p className="pb-2 text-lg">{t("form.deleteText")}</p>
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={existing ? t("form.editTitle") : tx ? t("form.fromBankTitle") : t("form.addTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("form.cancel")}
          </Button>
          <Button size="lg" disabled={pending} leadingIcon={<Icons.Check />} onClick={submit}>
            {t("form.save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6 pb-2">
        {/* 1. The receipt: the easiest first step, and it's what the accountant needs. */}
        <fieldset className="flex flex-col gap-2">
          <legend className="text-lg font-bold">{t("form.photo")}</legend>
          <p className="text-base text-fg-muted">{t("form.photoHint")}</p>
          {existing?.receipt && !file && (
            <div className="flex flex-wrap items-center gap-2 text-base">
              <Icons.Receipt className="size-5 text-success" />
              <span>{t("form.currentReceipt")}</span>
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => exec(() => removeReceipt(existing.id), { success: t("form.receiptRemoved"), onSuccess: onClose })}>
                {t("form.removeReceipt")}
              </Button>
            </div>
          )}
          {file && !fileError && (
            <p className="flex items-center gap-2 text-base text-success" role="status">
              <Icons.Check className="size-5" />
              {t("form.photoChosen", { name: file.name })}
            </p>
          )}
          {fileError && (
            <p className="text-base text-danger" role="alert">
              {t("form.photoError")}
            </p>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/*,application/pdf"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => void pickFile(e.target.files?.[0])}
            data-testid="receipt-input"
          />
          <div>
            <Button variant="secondary" size="lg" leadingIcon={<Icons.Camera />} onClick={() => fileInput.current?.click()}>
              {file || existing?.receipt ? t("form.replacePhoto") : t("form.takePhoto")}
            </Button>
          </div>
        </fieldset>

        <TextField label={t("form.supplier")} hint={t("form.supplierHint")} value={supplier} maxLength={120} onChange={(e) => setSupplier(e.target.value)} error={showErrors ? errors.supplier : undefined} />
        <TextField
          label={t("form.amount")}
          hint={t("form.amountHint")}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={showErrors || (amount && !cents) ? errors.amount : undefined}
        />
        <TextField label={t("form.date")} type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} error={showErrors ? errors.date : undefined} />
        <Select
          label={t("form.category")}
          value={category}
          onChange={(e) => {
            const c = e.target.value as CostCategory;
            setCategory(c);
            if (!rateTouched) setRate(CATEGORY_DEFAULT_BTW[c]);
          }}
          options={COST_CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }))}
        />
        <div className="flex flex-col gap-2">
          <RadioCardGroup
            legend={t("form.btw")}
            name="btw-rate"
            value={rate}
            onChange={(v) => {
              setRate(v as BtwTreatment);
              setRateTouched(true);
            }}
            options={RATES.map((r) => ({ value: r, title: t(`rates.${r}`) }))}
          />
          <p className="text-base text-fg-muted">{t("form.btwHint")}</p>
          {cents ? (
            <p className="text-lg" role="status">
              {rate === "exempt" ? t("form.btwPreviewNone") : t("form.btwPreview", { btw: formatEuro(btw, locale) })}
            </p>
          ) : null}
        </div>
        <TextField label={t("form.description")} hint={t("form.descriptionHint")} optional value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />

        {existing && (
          <div>
            <Button variant="ghost" leadingIcon={<Icons.Trash />} onClick={() => setConfirmDelete(true)}>
              {t("form.delete")}
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/** The page's one main action. */
export function AddCostButton({ area, today }: { area: BooksArea; today: string }) {
  const t = useTranslations("books");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="lg" leadingIcon={<Icons.Plus />} onClick={() => setOpen(true)}>
        {t("addCost")}
      </Button>
      {open && <CostSheet mode={{ kind: "add" }} area={area} today={today} onClose={() => setOpen(false)} />}
    </>
  );
}

/** "Change" or "Add receipt" next to a cost: both open the same sheet. */
export function EditCostButton({ expense, area, today, variant }: { expense: Expense; area: BooksArea; today: string; variant: "edit" | "receipt" }) {
  const t = useTranslations("books");
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === "receipt" ? (
        <Button size="sm" leadingIcon={<Icons.Camera />} onClick={() => setOpen(true)}>
          {t("addReceipt")}
        </Button>
      ) : (
        <Button variant="ghost" size="sm" leadingIcon={<Icons.Pencil />} aria-label={t("editLabel", { supplier: expense.supplier })} onClick={() => setOpen(true)}>
          {t("edit")}
        </Button>
      )}
      {open && <CostSheet mode={{ kind: "edit", expense }} area={area} today={today} onClose={() => setOpen(false)} />}
    </>
  );
}
