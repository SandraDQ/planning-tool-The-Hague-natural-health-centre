"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Checkbox, Icons, RadioCardGroup, Select, Sheet } from "@/design-system";
import type { MatchSuggestion } from "@/lib/books/matching";
import type { BankTransaction } from "@/lib/domain/types";
import { useRunAction } from "@/features/dashboard/useRunAction";
import { acceptBooksTerms, connectBank, matchPayment, renewBankConsent, requestBooksAddon, unmatchPayment } from "./actions";
import { CostSheet, type BooksArea } from "./CostSheet";

type Choice = { id: string; label: string };
type Option = "invoice" | "other_income" | "counted" | "new_cost" | "cost" | "private";

/** The buttons under one bank payment that needs a look: confirm the suggestion, or choose. */
export function PaymentActions({
  transaction,
  suggestion,
  area,
  today,
  openInvoices,
  openCosts,
}: {
  transaction: BankTransaction;
  suggestion: MatchSuggestion;
  area: BooksArea;
  today: string;
  openInvoices: Choice[];
  openCosts: Choice[];
}) {
  const t = useTranslations("books.bank");
  const { pending, exec } = useRunAction(area);
  const [choosing, setChoosing] = useState(false);
  const [addingCost, setAddingCost] = useState(false);
  const saved = { success: t("saved") };

  const confirm = () => {
    if (!suggestion) return setChoosing(true);
    if (suggestion.kind === "new_expense") return setAddingCost(true);
    const match =
      suggestion.kind === "invoice"
        ? ({ kind: "invoice", invoiceId: suggestion.invoiceId } as const)
        : suggestion.kind === "expense"
          ? ({ kind: "expense", expenseId: suggestion.expenseId } as const)
          : ({ kind: "counted" } as const);
    exec(() => matchPayment(transaction.id, match), saved);
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} leadingIcon={suggestion ? <Icons.Check /> : undefined} onClick={confirm}>
          {!suggestion ? t("choose") : suggestion.kind === "new_expense" ? t("addAsCost") : t("confirm")}
        </Button>
        {suggestion && (
          <Button variant="secondary" disabled={pending} onClick={() => setChoosing(true)}>
            {t("somethingElse")}
          </Button>
        )}
      </div>
      {choosing && (
        <ChooseSheet
          transaction={transaction}
          area={area}
          openInvoices={openInvoices}
          openCosts={openCosts}
          onClose={() => setChoosing(false)}
          onNewCost={() => {
            setChoosing(false);
            setAddingCost(true);
          }}
        />
      )}
      {addingCost && (
        <CostSheet
          mode={{ kind: "fromBank", transaction, category: suggestion?.kind === "new_expense" ? suggestion.category : null }}
          area={area}
          today={today}
          onClose={() => setAddingCost(false)}
        />
      )}
    </>
  );
}

function ChooseSheet({
  transaction,
  area,
  openInvoices,
  openCosts,
  onClose,
  onNewCost,
}: {
  transaction: BankTransaction;
  area: BooksArea;
  openInvoices: Choice[];
  openCosts: Choice[];
  onClose: () => void;
  onNewCost: () => void;
}) {
  const t = useTranslations("books.bank");
  const tf = useTranslations("books.form");
  const { pending, exec } = useRunAction(area);
  const incoming = transaction.amountCents > 0;
  const options: Option[] = incoming ? ["invoice", "other_income", "counted", "private"] : ["new_cost", "cost", "private"];
  const [option, setOption] = useState<Option>(options[0]);
  const [invoiceId, setInvoiceId] = useState(openInvoices[0]?.id ?? "");
  const [costId, setCostId] = useState(openCosts[0]?.id ?? "");

  const titles: Record<Option, [string, string]> = {
    invoice: [t("optionInvoice"), t("optionInvoiceText")],
    other_income: [t("optionOtherIncome"), t("optionOtherIncomeText")],
    counted: [t("optionCounted"), t("optionCountedText")],
    new_cost: [t("optionNewCost"), t("optionNewCostText")],
    cost: [t("optionCost"), t("optionCostText")],
    private: [t("optionPrivate"), t("optionPrivateText")],
  };
  const blocked = (option === "invoice" && !invoiceId) || (option === "cost" && !costId);

  const save = () => {
    if (option === "new_cost") return onNewCost();
    const match =
      option === "invoice"
        ? ({ kind: "invoice", invoiceId } as const)
        : option === "cost"
          ? ({ kind: "expense", expenseId: costId } as const)
          : ({ kind: option } as const);
    exec(() => matchPayment(transaction.id, match), { success: t("saved"), onSuccess: onClose });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={t("chooseTitle")}
      description={`${transaction.counterparty} · ${transaction.description}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tf("cancel")}
          </Button>
          <Button size="lg" disabled={pending || blocked} onClick={save}>
            {option === "new_cost" ? t("next") : t("save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        <RadioCardGroup
          legend={t("chooseTitle")}
          hideLegend
          name="payment-kind"
          value={option}
          onChange={(v) => setOption(v as Option)}
          options={options.map((o) => ({ value: o, title: titles[o][0], description: titles[o][1] }))}
        />
        {option === "invoice" &&
          (openInvoices.length ? (
            <Select label={t("pickInvoice")} value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} options={openInvoices.map((i) => ({ value: i.id, label: i.label }))} />
          ) : (
            <p className="text-base text-fg-muted">{t("noOpenInvoices")}</p>
          ))}
        {option === "cost" &&
          (openCosts.length ? (
            <Select label={t("pickCost")} value={costId} onChange={(e) => setCostId(e.target.value)} options={openCosts.map((c) => ({ value: c.id, label: c.label }))} />
          ) : (
            <p className="text-base text-fg-muted">{t("noOpenCosts")}</p>
          ))}
      </div>
    </Sheet>
  );
}

export function UndoMatchButton({ transactionId, area }: { transactionId: string; area: BooksArea }) {
  const t = useTranslations("books.bank");
  const { pending, exec } = useRunAction(area);
  return (
    <Button variant="ghost" size="sm" disabled={pending} leadingIcon={<Icons.Repeat />} onClick={() => exec(() => unmatchPayment(transactionId), { success: t("undone") })}>
      {t("undo")}
    </Button>
  );
}

export function ConnectBankButton({ area }: { area: BooksArea }) {
  const t = useTranslations("books.bank");
  const { pending, exec } = useRunAction(area);
  return (
    <Button size="lg" disabled={pending} leadingIcon={<Icons.Bank />} onClick={() => exec(() => connectBank(), { success: t("connected") })}>
      {t("connect")}
    </Button>
  );
}

export function RenewConsentButton({ area, primary }: { area: BooksArea; primary?: boolean }) {
  const t = useTranslations("books.bank");
  const { pending, exec } = useRunAction(area);
  return (
    <Button variant={primary ? "primary" : "secondary"} size="sm" disabled={pending} leadingIcon={<Icons.Repeat />} onClick={() => exec(() => renewBankConsent(), { success: t("renewed") })}>
      {t("renew")}
    </Button>
  );
}

/** Therapist without the add-on: ask the centre to switch it on. */
export function RequestAddonButton() {
  const t = useTranslations("books.addon");
  const { pending, exec } = useRunAction("therapist");
  return (
    <Button size="lg" disabled={pending} leadingIcon={<Icons.Mail />} onClick={() => exec(() => requestBooksAddon(), { success: t("requested"), successText: t("requestedText") })}>
      {t("request")}
    </Button>
  );
}

/** Therapist with the add-on switched on: agree to the processing terms once, then start. */
export function AcceptTermsForm() {
  const t = useTranslations("books.addon");
  const { pending, exec } = useRunAction("therapist");
  const [agreed, setAgreed] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <Checkbox label={t("termsCheck")} checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
      <div>
        <Button size="lg" disabled={pending || !agreed} leadingIcon={<Icons.Check />} onClick={() => exec(() => acceptBooksTerms(), { success: t("termsAccepted") })}>
          {t("termsAccept")}
        </Button>
      </div>
    </div>
  );
}
